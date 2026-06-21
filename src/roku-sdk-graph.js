'use strict';

/**
 * Builds a graphify-compatible graph of the Roku SDK:
 *   - BrightScript ro* component nodes       (type: Node)
 *   - BrightScript if* interface nodes        (type: interface)
 *   - SceneGraph node hierarchy               (type: roSGNode)
 *   - Interface / component method nodes      (type: function)
 *   - SceneGraph field nodes                  (type: field)
 *
 * Edges:
 *   - implements   ro* → if*
 *   - extends      roSGNode → roSGNode
 *   - has_method   interface/Node → function
 *   - has_field    roSGNode → field
 */

const fs = require('fs');
const path = require('path');
const { loadGraphFromData } = require('@sentropic/graphify');

const SCENEGRAPH_NODE_DIRS = [
  'abstract-nodes',
  'animation-nodes',
  'control-nodes',
  'dialog-nodes',
  'dynamic-voice-keyboard-nodes',
  'label-nodes',
  'layout-group-nodes',
  'list-and-grid-nodes',
  'media-playback-nodes',
  'renderable-nodes',
  'sliding-panels-nodes',
  'standard-dialog-framework-nodes',
  'typographic-nodes',
  'widget-nodes',
];

// ── Frontmatter helpers ───────────────────────────────────────────────────────

function extractFrontmatterTitle(content) {
  const m = content.match(/^---\s*\n(?:[\s\S]*?\n)?title:\s*["']?([^"'\n]+?)["']?\s*\n/);
  return m ? m[1].trim() : null;
}

function extractFrontmatterDeprecated(content) {
  const m = content.match(/\ndeprecated:\s*(true|false)/);
  return m ? m[1] === 'true' : false;
}

// ── Interface extraction ──────────────────────────────────────────────────────

function extractSupportedInterfaces(content) {
  const m = content.match(/##\s+Supported interfaces\s*\n([\s\S]*?)(?:\n##|\n---|\n\*\*|$)/i);
  if (!m) return [];
  const names = [];
  for (const match of m[1].matchAll(/\[([^\]]+)\]\(doc:/g)) {
    names.push(match[1].trim());
  }
  return names;
}

function extractExtends(content) {
  const m = content.match(/Extends\s+\[(?:\*\*)?([^\]]+?)(?:\*\*)?\]\(/);
  return m ? m[1].trim() : null;
}

// ── Function/method extraction ────────────────────────────────────────────────

/**
 * Parse "### FunctionName(params) As ReturnType" headers from a ## Supported methods section.
 * Returns array of { name, signature, params, returnType }.
 */
function extractMethods(content) {
  const sectionMatch = content.match(/##\s+Supported methods\s*\n([\s\S]*?)(?:\n## [^#]|$)/i);
  if (!sectionMatch) return [];

  const methods = [];
  for (const m of sectionMatch[1].matchAll(/^###\s+(.+)$/gm)) {
    const signature = m[1].trim();
    // "FunctionName(params) As ReturnType" or "FunctionName(params)"
    const sigMatch = signature.match(/^(\w+)\(([^)]*)\)(?:\s+[Aa]s\s+(\S+))?/);
    if (!sigMatch) continue;
    methods.push({
      name: sigMatch[1],
      signature,
      params: sigMatch[2].trim() || null,
      returnType: sigMatch[3] || null,
    });
  }
  return methods;
}

// ── Field/attribute extraction ────────────────────────────────────────────────

/**
 * Parse fields from ## Fields section — handles both HTML <table> and markdown | table | formats.
 * Returns array of { name, type, defaultValue, access }.
 */
function extractFields(content) {
  const sectionMatch = content.match(/##\s+Fields\s*\n([\s\S]*?)(?:\n## [^#]|$)/i);
  if (!sectionMatch) return [];
  const section = sectionMatch[1];
  const fields = [];
  const seen = new Set();

  // Markdown table rows: | fieldName | type | default | access | desc |
  for (const m of section.matchAll(/^\|\s*([^|*\-][^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/gm)) {
    const name = m[1].trim();
    if (!name || /^-+$/.test(name) || /^Field$/i.test(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    fields.push({ name, type: m[2].trim() || null, defaultValue: m[3].trim() || null, access: m[4].trim() || null });
  }

  // Compact single-line HTML: <tr><td>name</td><td>type</td><td>default</td><td>access</td>...
  // Uses [^<]* so it naturally stops before any nested HTML (e.g. tables in description cells)
  for (const row of section.matchAll(/<tr>\s*<td>([^<]+)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>/gi)) {
    const name = row[1].trim();
    if (!name || /^Field$/i.test(name) || seen.has(name)) continue;
    seen.add(name);
    fields.push({ name, type: row[2].trim() || null, defaultValue: row[3].trim() || null, access: row[4].trim() || null });
  }

  // Multi-line HTML (<thead>/<tbody> style): extract <tr> blocks, pull <td> values from each.
  // Inner table rows in description cells only have 2 cols (no header) so cells.length < 4 filters them.
  for (const row of section.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(c => c[1].replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').trim());
    if (cells.length < 4) continue;
    const name = cells[0];
    if (!name || /^Field$/i.test(name) || seen.has(name) || !/^\w/.test(name)) continue;
    seen.add(name);
    fields.push({ name, type: cells[1] || null, defaultValue: cells[2] || null, access: cells[3] || null });
  }

  return fields;
}

// ── File helpers ──────────────────────────────────────────────────────────────

function readMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md') && f !== 'index.md')
    .map(f => ({ file: f, content: fs.readFileSync(path.join(dir, f), 'utf-8') }));
}

// ── Graph builder ─────────────────────────────────────────────────────────────

function buildRokuSdkGraph(sdkDocsPath) {
  const bsRoot = path.join(sdkDocsPath, 'docs/REFERENCES/brightscript');
  const sgRoot = path.join(sdkDocsPath, 'docs/REFERENCES/scenegraph');

  const nodes = {};
  const links = [];

  function addNode(node) { nodes[node.id] = node; }
  function addLink(link) { links.push(link); }

  // ── BrightScript ro* components ───────────────────────────────────────────
  for (const { file, content } of readMarkdownFiles(path.join(bsRoot, 'components'))) {
    const title = extractFrontmatterTitle(content) || path.basename(file, '.md');
    const id = `ro:${title}`;
    addNode({
      id,
      label: title,
      type: 'Node',
      deprecated: extractFrontmatterDeprecated(content),
      docFile: `brightscript/components/${file}`,
    });

    for (const ifName of extractSupportedInterfaces(content)) {
      addLink({ source: id, target: `if:${ifName}`, relation: 'implements' });
    }

    // Some component docs define their own methods (not via interfaces)
    for (const fn of extractMethods(content)) {
      const fnId = `fn:${title}:${fn.name}`;
      addNode({ id: fnId, label: fn.name, type: 'function', signature: fn.signature, params: fn.params, returnType: fn.returnType, owner: title });
      addLink({ source: id, target: fnId, relation: 'has_method' });
    }
  }

  // ── BrightScript if* interfaces ───────────────────────────────────────────
  for (const { file, content } of readMarkdownFiles(path.join(bsRoot, 'interfaces'))) {
    const title = extractFrontmatterTitle(content) || path.basename(file, '.md');
    const id = `if:${title}`;
    addNode({
      id,
      label: title,
      type: 'interface',
      deprecated: extractFrontmatterDeprecated(content),
      docFile: `brightscript/interfaces/${file}`,
    });

    for (const fn of extractMethods(content)) {
      const fnId = `fn:${title}:${fn.name}`;
      addNode({ id: fnId, label: fn.name, type: 'function', signature: fn.signature, params: fn.params, returnType: fn.returnType, owner: title });
      addLink({ source: id, target: fnId, relation: 'has_method' });
    }
  }

  // ── SceneGraph nodes ──────────────────────────────────────────────────────

  function addSgNode(content, docFile, category) {
    const title = extractFrontmatterTitle(content) || path.basename(docFile, '.md');
    const id = `sg:${title}`;
    addNode({
      id,
      label: title,
      type: 'roSGNode',
      category,
      deprecated: extractFrontmatterDeprecated(content),
      docFile,
    });

    const parent = extractExtends(content);
    if (parent) addLink({ source: id, target: `sg:${parent}`, relation: 'extends' });

    for (const field of extractFields(content)) {
      const fieldId = `field:${title}:${field.name}`;
      addNode({ id: fieldId, label: field.name, type: 'field', fieldType: field.type, defaultValue: field.defaultValue, access: field.access, owner: title });
      addLink({ source: id, target: fieldId, relation: 'has_field' });
    }
  }

  const nodeMd = path.join(sgRoot, 'node.md');
  if (fs.existsSync(nodeMd)) addSgNode(fs.readFileSync(nodeMd, 'utf-8'), 'scenegraph/node.md', 'base');

  const sceneMd = path.join(sgRoot, 'scene.md');
  if (fs.existsSync(sceneMd)) addSgNode(fs.readFileSync(sceneMd, 'utf-8'), 'scenegraph/scene.md', 'scene');

  for (const dir of SCENEGRAPH_NODE_DIRS) {
    for (const { file, content } of readMarkdownFiles(path.join(sgRoot, dir))) {
      addSgNode(content, `scenegraph/${dir}/${file}`, dir);
    }
  }

  // Fill in any dangling link targets as stub nodes
  for (const link of links) {
    if (!nodes[link.target]) {
      const label = link.target.replace(/^[a-z]+:/, '');
      nodes[link.target] = { id: link.target, label, type: 'unknown' };
    }
  }

  return {
    directed: true,
    graph: { label: 'Roku SDK Type Graph', source: sdkDocsPath },
    nodes: Object.values(nodes),
    links,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

function loadRokuSdkGraph(sdkDocsPath) {
  return loadGraphFromData(buildRokuSdkGraph(sdkDocsPath));
}

module.exports = { buildRokuSdkGraph, loadRokuSdkGraph };

// ── CLI ───────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const sdkDocsPath = process.argv[2] || '/tmp/roku-sdk-docs';
  const raw = buildRokuSdkGraph(sdkDocsPath);

  const byType = {}, byRel = {};
  for (const n of raw.nodes) byType[n.type] = (byType[n.type] || 0) + 1;
  for (const l of raw.links) byRel[l.relation] = (byRel[l.relation] || 0) + 1;

  console.log('=== Roku SDK Type Graph ===');
  console.log('Nodes:');
  for (const [t, c] of Object.entries(byType)) console.log(`  ${t}: ${c}`);
  console.log('Links:');
  for (const [r, c] of Object.entries(byRel)) console.log(`  ${r}: ${c}`);

  const outputPath = process.argv[3];
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(raw, null, 2));
    console.log(`\nWrote graph JSON to ${outputPath}`);
  }
}
