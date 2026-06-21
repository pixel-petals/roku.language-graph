'use strict';

/**
 * Builds a graphify-compatible graph of the Roku SDK:
 *   - BrightScript ro* component nodes
 *   - BrightScript if* interface nodes
 *   - SceneGraph node hierarchy
 *   - "implements" edges (ro* → if*)
 *   - "extends" edges (SceneGraph node → parent node)
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

function extractFrontmatterTitle(content) {
  const m = content.match(/^---\s*\n(?:[\s\S]*?\n)?title:\s*["']?([^"'\n]+?)["']?\s*\n/);
  return m ? m[1].trim() : null;
}

function extractFrontmatterDeprecated(content) {
  const m = content.match(/\ndeprecated:\s*(true|false)/);
  return m ? m[1] === 'true' : false;
}

/**
 * Parse ## Supported interfaces section from a component doc.
 * Returns array of interface display names (e.g. ["ifArray", "ifEnum"]).
 */
function extractSupportedInterfaces(content) {
  const sectionMatch = content.match(/##\s+Supported interfaces\s*\n([\s\S]*?)(?:\n##|\n---|\n\*\*|$)/i);
  if (!sectionMatch) return [];
  const section = sectionMatch[1];
  const names = [];
  for (const m of section.matchAll(/\[([^\]]+)\]\(doc:/g)) {
    names.push(m[1].trim());
  }
  return names;
}

/**
 * Parse "Extends [Name](doc:...)" or "Extends [**Name**](doc:...)" or
 * "Extends [Name](/dev/docs/...)" from a SceneGraph node doc.
 * Returns the display name (e.g. "Group", "ArrayGrid").
 */
function extractExtends(content) {
  const m = content.match(/Extends\s+\[(?:\*\*)?([^\]]+?)(?:\*\*)?\]\(/);
  return m ? m[1].trim() : null;
}

function readMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md') && f !== 'index.md' && f !== '_order.yaml')
    .map(f => ({ file: f, content: fs.readFileSync(path.join(dir, f), 'utf-8') }));
}

function buildRokuSdkGraph(sdkDocsPath) {
  const bsRoot = path.join(sdkDocsPath, 'docs/REFERENCES/brightscript');
  const sgRoot = path.join(sdkDocsPath, 'docs/REFERENCES/scenegraph');

  const nodes = {};
  const links = [];

  // ── BrightScript ro* components ──────────────────────────────────────────
  for (const { file, content } of readMarkdownFiles(path.join(bsRoot, 'components'))) {
    const title = extractFrontmatterTitle(content) || path.basename(file, '.md');
    const id = `ro:${title}`;
    nodes[id] = {
      id,
      label: title,
      type: 'ro_component',
      deprecated: extractFrontmatterDeprecated(content),
      docFile: `brightscript/components/${file}`,
    };

    for (const ifName of extractSupportedInterfaces(content)) {
      links.push({ source: id, target: `if:${ifName}`, relation: 'implements' });
    }
  }

  // ── BrightScript if* interfaces ──────────────────────────────────────────
  for (const { file, content } of readMarkdownFiles(path.join(bsRoot, 'interfaces'))) {
    const title = extractFrontmatterTitle(content) || path.basename(file, '.md');
    const id = `if:${title}`;
    nodes[id] = {
      id,
      label: title,
      type: 'if_interface',
      deprecated: extractFrontmatterDeprecated(content),
      docFile: `brightscript/interfaces/${file}`,
    };
  }

  // ── SceneGraph nodes ──────────────────────────────────────────────────────

  // Top-level node.md (no Extends — it's the base)
  const nodeMd = path.join(sgRoot, 'node.md');
  if (fs.existsSync(nodeMd)) {
    const content = fs.readFileSync(nodeMd, 'utf-8');
    const title = extractFrontmatterTitle(content) || 'Node';
    const id = `sg:${title}`;
    nodes[id] = { id, label: title, type: 'scenegraph_node', category: 'base', docFile: 'scenegraph/node.md' };
  }

  // Top-level scene.md
  const sceneMd = path.join(sgRoot, 'scene.md');
  if (fs.existsSync(sceneMd)) {
    const content = fs.readFileSync(sceneMd, 'utf-8');
    const title = extractFrontmatterTitle(content) || 'Scene';
    const id = `sg:${title}`;
    const parent = extractExtends(content);
    nodes[id] = { id, label: title, type: 'scenegraph_node', category: 'scene', docFile: 'scenegraph/scene.md' };
    if (parent) links.push({ source: id, target: `sg:${parent}`, relation: 'extends' });
  }

  // Subdirectory node docs
  for (const dir of SCENEGRAPH_NODE_DIRS) {
    const fullDir = path.join(sgRoot, dir);
    for (const { file, content } of readMarkdownFiles(fullDir)) {
      const title = extractFrontmatterTitle(content) || path.basename(file, '.md');
      const id = `sg:${title}`;
      const parent = extractExtends(content);
      nodes[id] = {
        id,
        label: title,
        type: 'scenegraph_node',
        category: dir,
        deprecated: extractFrontmatterDeprecated(content),
        docFile: `scenegraph/${dir}/${file}`,
      };
      if (parent) links.push({ source: id, target: `sg:${parent}`, relation: 'extends' });
    }
  }

  // Fill in any link targets that are missing as stub nodes
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

/**
 * Load the Roku SDK type graph into a live graphify graph.
 * Returns the graphology Graph instance.
 */
function loadRokuSdkGraph(sdkDocsPath) {
  const raw = buildRokuSdkGraph(sdkDocsPath);
  return loadGraphFromData(raw);
}

/**
 * Print a quick summary of the graph.
 */
function summarize(raw) {
  const byType = {};
  for (const n of raw.nodes) {
    byType[n.type] = (byType[n.type] || 0) + 1;
  }
  const byRel = {};
  for (const l of raw.links) {
    byRel[l.relation] = (byRel[l.relation] || 0) + 1;
  }
  console.log('=== Roku SDK Type Graph ===');
  console.log('Nodes:');
  for (const [type, count] of Object.entries(byType)) {
    console.log(`  ${type}: ${count}`);
  }
  console.log('Links:');
  for (const [rel, count] of Object.entries(byRel)) {
    console.log(`  ${rel}: ${count}`);
  }
}

module.exports = { buildRokuSdkGraph, loadRokuSdkGraph };

// Run as script: node roku-sdk-graph.js <path-to-roku-sdk-docs>
if (require.main === module) {
  const sdkDocsPath = process.argv[2] || '/tmp/roku-sdk-docs';
  const raw = buildRokuSdkGraph(sdkDocsPath);
  summarize(raw);

  const outputPath = process.argv[3];
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(raw, null, 2));
    console.log(`\nWrote graph JSON to ${outputPath}`);
  }
}
