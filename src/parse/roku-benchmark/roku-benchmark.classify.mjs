/**
 * roku-benchmark.classify.mjs
 *
 * Splits the benchmark catalog into SceneGraph vs BrightScript rows, to
 * match the same split applied to the SDK reference graph (see
 * roku-sdk.graph.js's partitionRecords and cli.generate-sdk-exports.mjs).
 *
 * Verified against the real catalog (492 rows): 145 SceneGraph / 347
 * BrightScript. 13 suites are genuinely cross-cutting by design — they
 * exist specifically to compare a SceneGraph-node approach against a
 * BrightScript-only one (e.g. mVsFieldVsLocal: node field vs `m` prop vs
 * local var) — their rows land in both categories, tagged
 * `comparativeSuite: true` so both halves stay findable by `suiteName`
 * across the two databases.
 */

const SCENEGRAPH_PATTERN = /roSGNode|SceneGraph|\.subtype\(\)|m\.global|global node|\.threadInfo\(\)/i;

/** @returns {'SceneGraph' | 'BrightScript'} */
export function classifyBenchmarkRow(row) {
  return SCENEGRAPH_PATTERN.test(row.operation) ? 'SceneGraph' : 'BrightScript';
}

/** Split catalog rows into { sceneGraph, brightScript }, tagging rows from cross-cutting suites. */
export function partitionCatalog(rows) {
  const categoryBySuite = new Map();
  for (const row of rows) {
    const category = classifyBenchmarkRow(row);
    if (!categoryBySuite.has(row.suiteName)) categoryBySuite.set(row.suiteName, new Set());
    categoryBySuite.get(row.suiteName).add(category);
  }
  const comparativeSuites = new Set([...categoryBySuite.entries()].filter(([, set]) => set.size > 1).map(([name]) => name));

  const sceneGraph = [];
  const brightScript = [];
  for (const row of rows) {
    const tagged = comparativeSuites.has(row.suiteName) ? { ...row, comparativeSuite: true } : row;
    (classifyBenchmarkRow(row) === 'SceneGraph' ? sceneGraph : brightScript).push(tagged);
  }

  return { sceneGraph, brightScript };
}
