'use strict';

/**
 * Bridges the tree-sitter BrightScript analysis with @sentropic/graphify.
 *
 * @sentropic/graphify uses graphology internally — we build a graphology-
 * compatible payload from our tree-sitter call graph so it can be loaded
 * directly with graphify's `loadGraphFromData`.
 */

const path = require('path');
const fs = require('fs');
const { analyze } = require('./index');
const { loadGraphFromData } = require('@sentropic/graphify');

/**
 * Parse one or more .brs files and return a graphify-compatible graph
 * that contains function nodes, call edges, and file provenance.
 */
function buildGraphifyGraph(filePaths) {
  const nodes = {};
  const edges = {};

  for (const filePath of filePaths) {
    const code = fs.readFileSync(filePath, 'utf-8');
    const filename = path.basename(filePath);
    const result = analyze(code);

    // Add function/sub nodes
    for (const fn of result.graph.getFunctions()) {
      const key = `fn:${filename}:${fn.name}`;
      nodes[key] = {
        id: key,
        label: fn.name,
        type: fn.kind,
        file: filename,
        startLine: fn.startLine,
        endLine: fn.endLine,
      };
    }

    // Add call edges
    for (const call of result.graph.getCallEdges()) {
      const fromKey = `fn:${filename}:${call.from}`;
      const toKey   = `fn:${filename}:${call.to}`;

      // Create placeholder nodes for unknown callees
      if (!nodes[fromKey]) nodes[fromKey] = { id: fromKey, label: call.from, type: 'unknown', file: filename };
      if (!nodes[toKey])   nodes[toKey]   = { id: toKey,   label: call.to,   type: 'unknown', file: filename };

      const edgeKey = `${fromKey}->${toKey}`;
      edges[edgeKey] = { source: fromKey, target: toKey, weight: call.weight };
    }

    // Surface tree-sitter query data as node metadata
    const funcCaptures = result.functions;
    const callCaptures = result.calls;

    for (const cap of funcCaptures) {
      const key = `fn:${filename}:${cap.text}`;
      if (nodes[key]) nodes[key].captureGroup = cap.name;
    }

    _ = callCaptures; // available for future enrichment
  }

  // Build graphify-compatible raw data.
  // loadGraphFromData expects { id, ...attrs } for nodes and { source, target, ...attrs } for edges.
  const raw = {
    directed: true,
    graph: { label: 'BrightScript Call Graph', source: filePaths.map(f => path.basename(f)).join(', ') },
    nodes: Object.values(nodes).map(({ id, ...attrs }) => ({ id, ...attrs })),
    links: Object.values(edges).map(e => ({ source: e.source, target: e.target, weight: e.weight })),
  };

  return raw;
}

/**
 * Load BrightScript files into a live graphify graph.
 * Returns the graphology Graph instance (same type graphify uses internally).
 */
function loadBrightScriptGraph(filePaths) {
  const raw = buildGraphifyGraph(filePaths);
  return loadGraphFromData(raw);
}

/**
 * Query the graph for all function nodes.
 */
function queryFunctions(graph) {
  const results = [];
  graph.forEachNode((key, attrs) => {
    if (attrs.type === 'function' || attrs.type === 'sub') {
      results.push({ key, ...attrs });
    }
  });
  return results;
}

/**
 * Query the graph for all call edges.
 */
function queryCalls(graph) {
  const results = [];
  graph.forEachEdge((key, attrs, source, target) => {
    results.push({ from: source, to: target, weight: attrs.weight });
  });
  return results;
}

module.exports = { buildGraphifyGraph, loadBrightScriptGraph, queryFunctions, queryCalls };

// Ignore unused var lint warning for `_`
var _;
