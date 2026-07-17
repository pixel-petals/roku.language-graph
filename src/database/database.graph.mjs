/**
 * database.graph.mjs
 *
 * Turns a stored graph (the {nodes, edges} record shape queryAll() returns)
 * into a `graphology` `Graph` usable by src/transform, and centralizes the
 * one call into `@sentropic/graphify` for community detection so it isn't
 * imported separately in multiple places.
 */

import Graph from 'graphology';
import { cluster } from '@sentropic/graphify';

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

/** Build a graphology graph from a stored {nodes, edges} pair (e.g. from GraphStore.queryAll()). */
export function toGraphologyGraph(nodes, edges) {
  const G = new Graph({ multi: true, type: 'directed' });
  addNodes(G, nodes);
  addEdges(G, edges);
  return G;
}

/** Community detection over a graphology graph. Returns Map<communityId, nodeId[]>. */
export function detectCommunities(graph) {
  return cluster(graph);
}

/** Set each node's `community` attribute from cluster()'s Map<communityId, nodeId[]>. */
export function assignCommunities(graph, communities) {
  for (const [communityId, nodeIds] of communities) {
    for (const nodeId of nodeIds) {
      if (graph.hasNode(nodeId)) graph.setNodeAttribute(nodeId, 'community', communityId);
    }
  }
  return graph;
}
