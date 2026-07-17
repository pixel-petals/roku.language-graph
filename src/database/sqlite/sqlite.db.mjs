/**
 * sqlite.db.mjs
 *
 * TODO: embedded SQLite store for the graph produced by src/parse — the
 * local counterpart of packages/code-review-graph's schema (nodes/edges/
 * metadata tables), owned here instead of in that package.
 */

/** @param {string} dbPath */
export function openDatabase(dbPath) {
  throw new Error('not implemented');
}
