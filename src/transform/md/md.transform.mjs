/**
 * md.transform.mjs
 *
 * Writes a graphology graph to Markdown wiki pages (one per community).
 * Delegates to @sentropic/graphify's toWiki() — already a working, tested
 * implementation, no need to reinvent it. Does its own file I/O, like
 * json.transform.mjs (also graphify-backed) — unlike the four pure
 * graph -> string transforms (dot-graph, graph-ml, md-mermaid, xml).
 */

import { toWiki as graphifyToWiki } from '@sentropic/graphify';

/** @param {import('graphology')} graph @param {Map} communities @param {string} outputDir */
export function toWiki(graph, communities, outputDir, opts) {
  return graphifyToWiki(graph, communities, outputDir, opts);
}
