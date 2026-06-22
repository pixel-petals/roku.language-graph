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
 *   sdk_type   — Roku SDK object referenced via CreateObject()
 *
 * Edge types:
 *   extends    — component → parent (SceneGraph hierarchy)
 *   defines    — component → function (component owns this handler)
 *   calls      — function → function (call graph)
 *   uses_sdk   — function → sdk_type (via CreateObject)
 *   has_field  — component → field (interface field)
 *   contains   — component → component (XML child component)
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

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
 * Extract CreateObject("roXxx") calls from BrightScript source.
 * Returns array of { sdkType, callerContext }
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

    // extends — only add edge if parent is also app-defined
    if (comp.extends && appComponents.has(comp.extends)) {
      addEdge(G, compId, `comp:${comp.extends}`, { relation: 'extends' });
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

  // ── 2. Scan BRS files ─────────────────────────────────────────────────────

  const brsFiles = findFiles(appDir, '.brs');
  for (const brsPath of brsFiles) {
    const source = fs.readFileSync(brsPath, 'utf8');
    const relPath = path.relative(appDir, brsPath);
    const ownerComponent = scriptToComponent.get(relPath) || null;

    // Parse tree
    let tree;
    try { tree = parse(source); } catch { continue; }

    // Functions/subs
    const funcs = runQuery(tree, QUERIES.functions);
    for (const f of funcs) {
      const funcId = `fn:${relPath}:${f.text}`;
      addNode(G, funcId, { type: 'function', label: f.text, file: relPath });

      if (ownerComponent) {
        addEdge(G, `comp:${ownerComponent}`, funcId, { relation: 'defines' });

        // Wire onChange handlers: if a field's onChange matches this function
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

    // Call graph — resolve callee within same file first, then cross-file
    const calls = runQuery(tree, QUERIES.calls);
    // Build local function name → id map for this file
    const localFns = new Map(funcs.map(f => [f.text, `fn:${relPath}:${f.text}`]));

    // We need caller context — re-walk the function nodes to get scope
    for (const call of calls) {
      const callee = call.text;
      const calleeId = localFns.get(callee) || `fn:?:${callee}`;
      if (!G.hasNode(calleeId)) {
        addNode(G, calleeId, { type: 'function', label: callee });
      }
      // Find which function this call is inside (approximation: nearest preceding function)
      const precedingFn = funcs.filter(f => f.startLine <= call.startLine).at(-1);
      if (precedingFn) {
        const callerId = `fn:${relPath}:${precedingFn.text}`;
        addEdge(G, callerId, calleeId, { relation: 'calls' });
      }
    }

    // CreateObject SDK references
    for (const sdkType of extractCreateObject(source)) {
      const sdkId = `sdk:${sdkType}`;
      addNode(G, sdkId, { type: 'sdk_type', label: sdkType });

      // Link from any function in this file that contains the CreateObject call
      const precedingFn = funcs.filter(f => {
        const idx = source.indexOf(`CreateObject("${sdkType}"`);
        const srcLine = source.slice(0, idx).split('\n').length;
        return f.startLine <= srcLine;
      }).at(-1);

      if (precedingFn) {
        const callerId = `fn:${relPath}:${precedingFn.text}`;
        addEdge(G, callerId, sdkId, { relation: 'uses_sdk' });
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
