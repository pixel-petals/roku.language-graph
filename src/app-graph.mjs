/**
 * app-graph.mjs
 *
 * Parses a Roku app directory (.brs + .xml files) and builds a graphology
 * graph suitable for Graphify analysis.
 *
 * Node types:
 *   component  — SceneGraph component defined in an XML file
 *   function   — BrightScript function or sub
 *   field      — Interface field exposed by a component
 *   sdk_ref    — Reference stub pointing to a node in the SDK graph.
 *                Carries a `sdkId` attribute (e.g. "sg:Scene", "ro:roSGScreen",
 *                "if:ifSGNodeFocus") but does NOT copy any SDK definitions.
 *
 * Edge types:
 *   extends    — component → sdk_ref (SceneGraph parent) or app component
 *   defines    — component → function (component owns this handler)
 *   calls      — function → function (call graph, app-defined only)
 *   uses_sdk   — function → sdk_ref (via CreateObject)
 *   uses_api   — function → sdk_ref (SDK interface method call)
 *   has_field  — component → field (interface field)
 *   contains   — component → component (XML child component)
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { resolveSDKNode, resolveSDKMethod, sdkGraphAvailable } from './sdk-refs.mjs';

const require = createRequire(import.meta.url);
const Graph = require('graphology').default || require('graphology');
const { parse } = require('./parser.js');
const { runQuery, QUERIES } = require('./queries.js');

// ── XML helpers ───────────────────────────────────────────────────────────────

/** Extract a single attribute value from an XML tag string. */
function attr(tagStr, name) {
  const m = tagStr.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
}

/**
 * Parse a Roku SceneGraph XML file.
 * Returns { name, extends, fields, scripts, children }
 */
function parseXml(xmlText, filePath) {
  const result = {
    name: null,
    extends: null,
    fields: [],
    scripts: [],
    children: [],
  };

  // Component declaration
  const compMatch = xmlText.match(/<component([^>]*)>/i);
  if (!compMatch) return null;
  result.name = attr(compMatch[1], 'name');
  result.extends = attr(compMatch[1], 'extends');

  // Interface fields
  const ifaceSection = xmlText.match(/<interface>([\s\S]*?)<\/interface>/i);
  if (ifaceSection) {
    for (const m of ifaceSection[1].matchAll(/<field([^>]*)\/?>/gi)) {
      const id       = attr(m[1], 'id');
      const type     = attr(m[1], 'type');
      const onChange = attr(m[1], 'onChange');
      if (id) result.fields.push({ id, type, onChange });
    }
  }

  // Script references
  for (const m of xmlText.matchAll(/<script[^>]+uri="([^"]*)"[^>]*>/gi)) {
    result.scripts.push(m[1].replace(/^pkg:\//, ''));
  }

  // Direct children (first-level elements in <children> block)
  const childSection = xmlText.match(/<children>([\s\S]*?)<\/children>/i);
  if (childSection) {
    // Self-closing tags with name attribute or element names that are PascalCase
    for (const m of childSection[1].matchAll(/<([A-Z][A-Za-z0-9]*)([^>]*)\/?>/g)) {
      const tag = m[1];
      if (['Animation', 'FloatFieldInterpolator', 'Poster', 'Label',
           'Rectangle', 'Group', 'Timer'].includes(tag)) continue;
      result.children.push(tag);
    }
  }

  return result;
}

// ── BRS helpers ───────────────────────────────────────────────────────────────

/**
 * Extract function/sub definitions via regex (case-insensitive).
 * Used as a reliable fallback when tree-sitter returns parse errors on
 * mixed-case keywords like "Sub Init()" or "End Sub".
 * Returns array of { text, startLine }.
 */
function extractFunctionDefs(source) {
  const results = [];
  const lines = source.split('\n');
  const pattern = /^\s*(?:function|sub)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/i;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(pattern);
    if (m) results.push({ text: m[1], startLine: i + 1 });
  }
  return results;
}

/**
 * Extract CreateObject("roXxx") calls from BrightScript source.
 * Returns array of SDK type name strings.
 */
function extractCreateObject(source) {
  const refs = [];
  for (const m of source.matchAll(/CreateObject\s*\(\s*"([^"]+)"\s*\)/gi)) {
    refs.push(m[1]);
  }
  return refs;
}

// ── Graph builder ─────────────────────────────────────────────────────────────

function addNode(G, id, attrs) {
  if (!G.hasNode(id)) G.addNode(id, attrs);
}

function addEdge(G, from, to, attrs) {
  if (G.hasNode(from) && G.hasNode(to) && !G.hasEdge(from, to)) {
    G.addEdge(from, to, attrs);
  }
}

/**
 * Add a lightweight SDK reference stub — just enough to name the target
 * node in the SDK graph. No methods, fields, or definitions are copied.
 * Returns the stub node ID.
 */
function addSdkRef(G, sdkEntry) {
  const stubId = `ref:${sdkEntry.sdkId}`;
  addNode(G, stubId, {
    type:    'sdk_ref',
    label:   sdkEntry.label,
    sdkId:   sdkEntry.sdkId,
    sdkType: sdkEntry.sdkType,
  });
  return stubId;
}

/**
 * Build a graph from a Roku app directory.
 * @param {string} appDir - absolute path to the Roku app root
 * @returns {Graph}
 */
export function buildAppGraph(appDir) {
  const G = new Graph({ type: 'directed', multi: false });

  // Map: component name → { name, extends, fields, scripts[] }
  const components = new Map();
  // Map: script rel-path → component name (for linking .brs → component)
  const scriptToComponent = new Map();

  // ── 1. First pass: collect app-defined component names ────────────────────
  // Anything not in this set is an SDK built-in and should be excluded.

  const xmlFiles = findFiles(appDir, '.xml');
  const parsedXmls = [];

  for (const xmlPath of xmlFiles) {
    const xmlText = fs.readFileSync(xmlPath, 'utf8');
    const comp = parseXml(xmlText, xmlPath);
    if (!comp || !comp.name) continue;
    parsedXmls.push(comp);
    components.set(comp.name, comp);
  }

  const appComponents = new Set(components.keys());

  // ── 2. Second pass: build graph (app nodes only) ──────────────────────────

  for (const comp of parsedXmls) {
    const compId = `comp:${comp.name}`;
    addNode(G, compId, { type: 'component', label: comp.name });

    // extends — app-defined parent gets a direct edge; SDK parent gets a ref stub
    if (comp.extends) {
      if (appComponents.has(comp.extends)) {
        addEdge(G, compId, `comp:${comp.extends}`, { relation: 'extends' });
      } else {
        const sdkEntry = resolveSDKNode(comp.extends);
        if (sdkEntry) {
          const stubId = addSdkRef(G, sdkEntry);
          addEdge(G, compId, stubId, { relation: 'extends' });
        }
      }
    }

    // interface fields
    for (const f of comp.fields) {
      const fieldId = `field:${comp.name}:${f.id}`;
      const label = f.type ? `${f.id} (${f.type})` : f.id;
      addNode(G, fieldId, { type: 'field', label });
      addEdge(G, compId, fieldId, { relation: 'has_field' });
    }

    // child components — only app-defined ones
    for (const child of comp.children) {
      if (!appComponents.has(child)) continue;
      const childId = `comp:${child}`;
      addEdge(G, compId, childId, { relation: 'contains' });
    }

    // register script paths for BRS linking
    for (const script of comp.scripts) {
      scriptToComponent.set(script, comp.name);
    }
  }

  // ── 2. First BRS pass: collect all app-defined function names ────────────────
  // key: function name (case-insensitive) → canonical funcId in graph

  const brsFiles = findFiles(appDir, '.brs');
  // Map: relPath → { source, tree, funcs }
  const parsedBrs = [];
  // Map: lowercase function name → funcId  (for cross-file call resolution)
  const appFuncIds = new Map();

  for (const brsPath of brsFiles) {
    const source = fs.readFileSync(brsPath, 'utf8');
    const relPath = path.relative(appDir, brsPath);
    let tree;
    try { tree = parse(source); } catch { continue; }

    const funcs = extractFunctionDefs(source);
    for (const f of funcs) {
      const funcId = `fn:${relPath}:${f.text}`;
      appFuncIds.set(f.text.toLowerCase(), funcId);
    }
    parsedBrs.push({ brsPath, relPath, source, tree, funcs });
  }

  // ── 3. Second BRS pass: build nodes and edges ─────────────────────────────

  for (const { relPath, source, tree, funcs } of parsedBrs) {
    const ownerComponent = scriptToComponent.get(relPath) || null;

    // Add function nodes
    for (const f of funcs) {
      const funcId = `fn:${relPath}:${f.text}`;
      addNode(G, funcId, { type: 'function', label: f.text, file: relPath });

      if (ownerComponent) {
        addEdge(G, `comp:${ownerComponent}`, funcId, { relation: 'defines' });

        // Wire onChange handlers
        const comp = components.get(ownerComponent);
        if (comp) {
          for (const field of comp.fields) {
            if (field.onChange === f.text) {
              const fieldId = `field:${ownerComponent}:${field.id}`;
              if (G.hasNode(fieldId)) {
                addEdge(G, fieldId, funcId, { relation: 'on_change' });
              }
            }
          }
        }
      }
    }

    // Call graph — only connect to app-defined functions.
    // tree-sitter call extraction still works even when function *definitions*
    // have parse errors (the keyword case issue only affects sub/function statements).
    const calls = runQuery(tree, QUERIES.calls);
    const localFnIds = new Map(funcs.map(f => [f.text.toLowerCase(), `fn:${relPath}:${f.text}`]));

    for (const call of calls) {
      const key = call.text.toLowerCase();
      // Prefer local definition, then cross-file; skip if not app-defined
      const calleeId = localFnIds.get(key) || appFuncIds.get(key);
      if (!calleeId) continue;

      const precedingFn = funcs.filter(f => f.startLine <= call.startLine).at(-1);
      if (precedingFn) {
        addEdge(G, `fn:${relPath}:${precedingFn.text}`, calleeId, { relation: 'calls' });
      }
    }

    // CreateObject → SDK ref stubs
    for (const sdkType of extractCreateObject(source)) {
      const sdkEntry = resolveSDKNode(sdkType);
      const stubId = sdkEntry
        ? addSdkRef(G, sdkEntry)
        : (() => { const id = `ref:unknown:${sdkType}`; addNode(G, id, { type: 'sdk_ref', label: sdkType, sdkId: null }); return id; })();

      const idx = source.toLowerCase().indexOf(`createobject("${sdkType.toLowerCase()}"`);
      if (idx === -1) continue;
      const srcLine = source.slice(0, idx).split('\n').length;
      const precedingFn = funcs.filter(f => f.startLine <= srcLine).at(-1);
      if (precedingFn) {
        addEdge(G, `fn:${relPath}:${precedingFn.text}`, stubId, { relation: 'uses_sdk' });
      }
    }

    // SDK API method calls → interface ref stubs
    // Only wire calls whose names resolve unambiguously to a single interface
    for (const call of calls) {
      const ifaces = resolveSDKMethod(call.text);
      if (ifaces.length !== 1) continue; // skip ambiguous or unknown

      const stubId = addSdkRef(G, ifaces[0]);
      const precedingFn = funcs.filter(f => f.startLine <= call.startLine).at(-1);
      if (precedingFn) {
        addEdge(G, `fn:${relPath}:${precedingFn.text}`, stubId, { relation: 'uses_api' });
      }
    }
  }

  return G;
}

// ── File walker ───────────────────────────────────────────────────────────────

function findFiles(dir, ext, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findFiles(full, ext, results);
    else if (entry.name.endsWith(ext)) results.push(full);
  }
  return results;
}
