/**
 * roku-app.graph.mjs
 *
 * Adapts parseRokuApp()'s flat {nodes, edges} into a graphology graph, so
 * downstream tooling (community detection, wiki/studio export) can consume
 * a Roku app the same way it consumes the Roku SDK graph.
 */

import Graph from 'graphology';
import { parseRokuApp } from './roku-app.parser.mjs';

function addNodes(G, nodes) {
  for (const n of nodes) {
    if (G.hasNode(n.qualifiedName)) continue;
    G.addNode(n.qualifiedName, { type: n.kind, label: n.name, filePath: n.filePath, language: n.language });
  }
}

function addEdges(G, edges) {
  for (const e of edges) {
    if (!G.hasNode(e.sourceQualified)) G.addNode(e.sourceQualified, { type: 'External', label: e.sourceQualified });
    if (!G.hasNode(e.targetQualified)) G.addNode(e.targetQualified, { type: 'External', label: e.targetQualified });
    G.addEdge(e.sourceQualified, e.targetQualified, { relation: e.kind, confidence: e.confidence, confidenceTier: e.confidenceTier });
  }
}

/** Build a graphology graph of a Roku app directory. */
export function buildAppGraph(appDir) {
  const { nodes, edges } = parseRokuApp(appDir);
  const G = new Graph({ multi: true, type: 'directed' });
  addNodes(G, nodes);
  addEdges(G, edges);
  return G;
}
