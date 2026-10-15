/**
 * db.benchmark.mjs
 *
 * Turns the checked-in benchmark catalog (src/parse/roku-benchmark/
 * roku-benchmark.catalog.json) into a cost model: BenchmarkOp nodes to
 * store alongside an app's graph, and a small, explicit alias table that
 * matches a CALLS edge's callee text to a benchmark measurement — not a
 * general fuzzy matcher (a wrong cost estimate is worse than none), and
 * only covers patterns actually present in the catalog.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.resolve(__dirname, '../parse/roku-benchmark/roku-benchmark.catalog.json');

// ponytail: deliberately small — only patterns resolvable from a bare
// callee identifier (no argument text available on a CALLS edge) that the
// catalog actually benchmarks. Add rows as real gaps are found; don't
// guess at coverage the catalog doesn't have.
const ALIAS_RULES = [
  { pattern: /^createobject$/i, suiteName: 'RoSGNodeCreation', testName: 'node' },
  { pattern: /\.ismatch$/i, suiteName: 'roRegex', testName: 'lifted' },
  { pattern: /(^|\.)md5$/i, suiteName: 'Md5', testName: 'small' },
  { pattern: /\.join$/i, suiteName: 'StringConcatenation', testName: 'literal join' },
  { pattern: /\.format$/i, suiteName: 'StringConcatenation', testName: '.format with 26 args' },
];

/** Load the benchmark catalog (always present — checked in). */
export function loadCostModel() {
  const rows = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  return { rows, byKey: new Map(rows.map(r => [`${r.suiteName}::${r.testName}`, r])) };
}

/** BenchmarkOp node records for every catalog row (measured or not) — for storing alongside an app's graph. */
export function benchmarkOpNodes(costModel) {
  return costModel.rows.map(r => ({
    kind: 'BenchmarkOp', name: `${r.suiteName}: ${r.testName}`, qualifiedName: `bench:${r.suiteName}:${r.testName}`,
    filePath: r.testFile, lineStart: null, lineEnd: null, language: 'brightscript',
    parentName: null, params: null, returnType: null, modifiers: null, isTest: false, fileHash: null,
    extra: {
      operation: r.operation, testFile: r.testFile, microsecondsPerOp: r.microsecondsPerOp,
      sampleCount: r.sampleCount, min: r.min, max: r.max, measuredAt: r.measuredAt, source: 'bsbench',
      comparativeSuite: r.comparativeSuite ?? false,
    },
  }));
}

/** Best-effort cost estimate for a CALLS edge's callee text, or null if no rule matches or that rule's benchmark hasn't been measured yet. */
export function estimateMicroseconds(calleeText, costModel) {
  if (!calleeText) return null;
  for (const rule of ALIAS_RULES) {
    if (!rule.pattern.test(calleeText)) continue;
    const row = costModel.byKey.get(`${rule.suiteName}::${rule.testName}`);
    if (row?.microsecondsPerOp == null) return null;
    return { microseconds: row.microsecondsPerOp, benchmarkOpQualifiedName: `bench:${rule.suiteName}:${rule.testName}` };
  }
  return null;
}
