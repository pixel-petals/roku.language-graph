/**
 * roku-benchmark.store.mjs
 *
 * Orchestrates a bsbench run: run → parse → (a) archive the raw capture
 * under .artifacts/ (gitignored, ephemeral, for debugging/audit), and
 * (b) merge the aggregated results into the checked-in
 * roku-benchmark.catalog.json in place — that catalog, not .artifacts, is
 * the durable source of truth everything else reads from.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runBsbench } from './roku-benchmark.runner.mjs';
import { parseBsbenchOutput } from './roku-benchmark.parser.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const CATALOG_PATH = path.join(__dirname, 'roku-benchmark.catalog.json');

function readCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
}

function writeCatalog(catalog) {
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + '\n');
}

/** Merge aggregated results into the catalog by (suiteName, testName); rows with no match are left untouched. */
export function mergeIntoCatalog(catalog, results) {
  const byKey = new Map(results.map(r => [`${r.suiteName}::${r.testName}`, r]));
  const measuredAt = new Date().toISOString();
  let updated = 0;

  const merged = catalog.map((row) => {
    const result = byKey.get(`${row.suiteName}::${row.testName}`);
    if (!result) return row;
    updated++;
    return {
      ...row,
      microsecondsPerOp: result.microsecondsPerOp,
      sampleCount: result.sampleCount,
      min: result.min,
      max: result.max,
      measuredAt,
    };
  });

  return { merged, updated };
}

function archiveRawCapture(rawText, results) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(REPO_ROOT, '.artifacts', 'roku-benchmark', timestamp);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'raw-output.txt'), rawText);
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(results, null, 2));
  return dir;
}

/** Run bsbench, archive the raw capture, and update the checked-in catalog with the results. */
export async function runAndUpdateCatalog(options) {
  const rawText = await runBsbench(options);
  const results = parseBsbenchOutput(rawText);
  const archiveDir = archiveRawCapture(rawText, results);

  const catalog = readCatalog();
  const { merged, updated } = mergeIntoCatalog(catalog, results);
  writeCatalog(merged);

  return { results, updatedCount: updated, archiveDir, catalogPath: CATALOG_PATH };
}
