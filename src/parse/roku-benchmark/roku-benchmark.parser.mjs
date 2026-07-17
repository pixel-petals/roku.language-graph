/**
 * roku-benchmark.parser.mjs
 *
 * Extracts and aggregates bsbench's `bsbenchStatus: {...}` JSON status
 * lines (one per sample, per test) from captured stdout into one record
 * per (suiteName, testName).
 */

const STATUS_LINE = /^\s*bsbenchStatus:\s*(.+?)\s*$/;

/** Extract every {suiteName, testName, sampleNumber, iterations, elapsedMicroseconds} sample from raw bsbench output. */
export function extractSamples(rawText) {
  const samples = [];
  for (const line of rawText.split(/\r?\n/)) {
    const match = STATUS_LINE.exec(line);
    if (!match) continue;
    try {
      samples.push(JSON.parse(match[1]));
    } catch {
      // malformed/truncated line (e.g. split across stdout chunks) — skip it
    }
  }
  return samples;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Aggregate raw samples into one {suiteName, testName, microsecondsPerOp, min, max, sampleCount} per test. */
export function aggregateSamples(samples) {
  const byTest = new Map();
  for (const s of samples) {
    const key = `${s.suiteName}::${s.testName}`;
    if (!byTest.has(key)) byTest.set(key, { suiteName: s.suiteName, testName: s.testName, perOp: [] });
    byTest.get(key).perOp.push(s.elapsedMicroseconds / s.iterations);
  }

  return [...byTest.values()].map(({ suiteName, testName, perOp }) => ({
    suiteName, testName,
    microsecondsPerOp: median(perOp),
    min: Math.min(...perOp),
    max: Math.max(...perOp),
    sampleCount: perOp.length,
  }));
}

/** Parse raw bsbench stdout into aggregated per-test results. */
export function parseBsbenchOutput(rawText) {
  return aggregateSamples(extractSamples(rawText));
}
