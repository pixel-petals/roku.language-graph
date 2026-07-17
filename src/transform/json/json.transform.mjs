/**
 * json.transform.mjs
 *
 * TODO: transform src/database's graph into a plain JSON export.
 * Currently @sentropic/graphify's toJson() covers this from cli.*.mjs
 * directly; move that responsibility here once src/database is real.
 */

/** @param {{nodes: object[], edges: object[]}} graph */
export function toJson(graph) {
  throw new Error('not implemented');
}
