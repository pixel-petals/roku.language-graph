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
const {
  extractFrontmatterTitle,
  extractFrontmatterDeprecated,
  extractDescription,
  extractSupportedInterfaces,
  extractExtends,
  extractMethods,
  extractFields,
  readMarkdownFiles,
} = require('./roku-sdk.scrape.js');

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
      description: extractDescription(content),
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
      description: extractDescription(content),
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
      description: extractDescription(content),
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
