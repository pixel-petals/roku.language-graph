/**
 * md.transform.mjs
 *
 * TODO: transform src/database's graph into Markdown wiki pages.
 * Currently @sentropic/graphify's toWiki() covers this from cli.*.mjs
 * directly; move that responsibility here once src/database is real.
 */

/** @param {{nodes: object[], edges: object[]}} graph */
export function toWiki(graph) {
  throw new Error('not implemented');
}
