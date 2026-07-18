/**
 * db.store.mjs
 *
 * Public entry point for persisting a parsed graph. Backed by PGlite
 * (embedded WASM Postgres) with the pgvector extension enabled, so nodes
 * can carry a similarity-searchable embedding alongside their graph data.
 *
 * GraphStore:
 *   upsertNodes(nodes: Node[])              -> Promise<void>  queue nodes for writing
 *   upsertEdges(edges: Edge[])              -> Promise<void>  queue edges for writing
 *   flush()                                 -> Promise<void>  commit queued nodes/edges
 *   upsertEmbedding(qualifiedName, vector)  -> Promise<void>  set a node's embedding
 *   queryNearestNodes(vector, limit)        -> Promise<Node[]> nearest nodes by embedding
 *   queryAll()                              -> Promise<{nodes, edges}>
 *   close()                                 -> Promise<void>
 *
 * Node:  { kind, name, qualifiedName, filePath, lineStart, lineEnd, language,
 *          parentName, params, returnType, modifiers, isTest, fileHash, extra }
 * Edge:  { kind, sourceQualified, targetQualified, filePath, line, extra,
 *          confidence, confidenceTier }
 * (the shape src/parse/roku-app already produces; src/parse/roku-sdk graphs
 * are adapted to it before storing — see roku-sdk.graph.js's toGraphRecords)
 */

import { openPgliteStore } from './pglite/pglite.db.mjs';

/** Open a GraphStore. `config` is a db path/dir (or omit for in-memory) or { path, embeddingDim }. */
export async function openGraphStore(config) {
  return openPgliteStore(config);
}
