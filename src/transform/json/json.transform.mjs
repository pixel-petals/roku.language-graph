/**
 * json.transform.mjs
 *
 * Writes a graphology graph to a JSON export. Delegates to
 * @sentropic/graphify's toJson() — already a working, tested implementation
 * of this exact format, no need to reinvent it. Does its own file I/O, like
 * md.transform.mjs (also graphify-backed) — unlike the four pure
 * graph -> string transforms (dot-graph, graph-ml, md-mermaid, xml).
 */

import { toJson as graphifyToJson } from '@sentropic/graphify';

/** @param {import('graphology')} graph @param {Map} communities @param {string} outputPath */
export function toJson(graph, communities, outputPath, opts) {
  return graphifyToJson(graph, communities, outputPath, opts);
}
