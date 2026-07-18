/**
 * roku-sdk.store.mjs
 *
 * Parses the Roku SDK docs and persists the resulting graph via a
 * GraphStore. This runs before any export/viz formatting — the database
 * is the source of truth, exports are just views over it.
 */

import { buildRokuSdkGraph, toGraphRecords } from './roku-sdk.graph.js';
import { openGraphStore } from '../../database/database.store.mjs';

/** Parse the Roku SDK docs at `sdkDocsPath` and store the graph via `storeConfig`. */
export async function parseAndStoreRokuSdk(sdkDocsPath, storeConfig) {
  const raw = buildRokuSdkGraph(sdkDocsPath);
  const { nodes, edges } = toGraphRecords(raw);

  const store = await openGraphStore(storeConfig);
  try {
    await store.upsertNodes(nodes);
    await store.upsertEdges(edges);
    await store.flush();
  } finally {
    await store.close();
  }

  return { raw, nodes, edges };
}
