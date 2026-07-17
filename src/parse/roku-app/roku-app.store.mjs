/**
 * roku-app.store.mjs
 *
 * Parses a Roku app directory and persists the resulting graph via a
 * GraphStore. This runs before any export/viz formatting — the database
 * is the source of truth, exports are just views over it.
 */

import { parseRokuApp } from './roku-app.parser.mjs';
import { openGraphStore } from '../../database/database.store.mjs';

/** Parse the Roku app at `appDir` and store the graph via `storeConfig`. */
export async function parseAndStoreRokuApp(appDir, storeConfig) {
  const { nodes, edges } = parseRokuApp(appDir);

  const store = await openGraphStore(storeConfig);
  try {
    await store.upsertNodes(nodes);
    await store.upsertEdges(edges);
    await store.flush();
  } finally {
    await store.close();
  }

  return { nodes, edges };
}
