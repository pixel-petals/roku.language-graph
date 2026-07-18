/**
 * roku-benchmark.parser.mjs
 *
 * Extracts aggregated per-test results from captured bsbench stdout.
 *
 * bsbench's `bsbenchStatus: {...}` JSON status lines (one per sample) are
 * the finer-grained path when present, but verified against a real device
 * run: they never actually appear — `npm run benchmark` prints only the
 * human-readable "FINAL RESULTS" tables (one in ops/sec, one in µs/op).
 * Both paths are supported; the JSON path wins when both exist for the
 * same test (it's real per-sample data, not a pre-aggregated table), the
 * table path is what real runs actually produce.
 */

const STATUS_LINE = /^\s*bsbenchStatus:\s*(.+?)\s*$/;
const RESULTS_TITLE = /^\s*(\S.*?)\s+--\s+FINAL RESULTS\s*$/;
const UNIT_LINE = /\(all values in\s+(\S+)\)/i;
const DIVIDER_LINE = /^[-=*]+\s*$/;

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

/** Parse one "<suite> -- FINAL RESULTS" table starting at lines[titleIndex]; returns { rows, nextIndex }. */
function parseOneTable(lines, titleIndex) {
  let j = titleIndex + 1;
  while (j < lines.length && DIVIDER_LINE.test(lines[j])) j++;

  const headerLine = lines[j];
  if (!headerLine) return { rows: [], nextIndex: j };
  const threadNames = headerLine.trim().split(/\s{2,}/).filter(Boolean);
  j++;
  while (j < lines.length && DIVIDER_LINE.test(lines[j])) j++;

  const dataLines = [];
  while (j < lines.length && lines[j].trim() && !DIVIDER_LINE.test(lines[j])) {
    dataLines.push(lines[j]);
    j++;
  }

  let unit = null;
  for (let k = j; k < Math.min(j + 4, lines.length); k++) {
    const unitMatch = UNIT_LINE.exec(lines[k]);
    if (unitMatch) { unit = unitMatch[1]; break; }
  }

  const rows = unit && /^(µs|us)/i.test(unit) ? dataLines.map(line => parseTableRow(line, threadNames)).filter(Boolean) : [];
  return { rows, nextIndex: j };
}

function parseTableRow(line, threadNames) {
  const rowMatch = /^\s*(.+?):\s*(.+)$/.exec(line);
  if (!rowMatch) return null;
  const testName = rowMatch[1].trim();
  const cells = rowMatch[2].trim().split(/\s{2,}/).filter(Boolean);

  const values = [];
  const byThread = {};
  cells.forEach((cell, idx) => {
    const num = parseFloat(cell.replace(/,/g, ''));
    if (!Number.isFinite(num)) return;
    values.push(num);
    if (threadNames[idx]) byThread[threadNames[idx]] = num;
  });
  if (!values.length) return null;

  return {
    testName, values, byThread,
    microsecondsPerOp: byThread.main ?? values[0],
    min: Math.min(...values), max: Math.max(...values), sampleCount: values.length,
  };
}

/** Extract per-test results from bsbench's human-readable "FINAL RESULTS" µs/op tables (the ops/sec table is skipped). */
export function extractFinalResultsTables(rawText) {
  const lines = rawText.split(/\r?\n/);
  const results = [];

  for (let i = 0; i < lines.length; i++) {
    const titleMatch = RESULTS_TITLE.exec(lines[i]);
    if (!titleMatch) continue;
    const suiteName = titleMatch[1].trim();

    const { rows, nextIndex } = parseOneTable(lines, i);
    for (const row of rows) {
      results.push({
        suiteName, testName: row.testName, microsecondsPerOp: row.microsecondsPerOp,
        min: row.min, max: row.max, sampleCount: row.sampleCount, threadValues: row.byThread,
      });
    }
    i = nextIndex;
  }

  return results;
}

/** Parse raw bsbench stdout into aggregated per-test results — JSON status-line samples where present, FINAL RESULTS tables otherwise. */
export function parseBsbenchOutput(rawText) {
  const jsonResults = aggregateSamples(extractSamples(rawText));
  const seen = new Set(jsonResults.map(r => `${r.suiteName}::${r.testName}`));

  const merged = [...jsonResults];
  for (const r of extractFinalResultsTables(rawText)) {
    const key = `${r.suiteName}::${r.testName}`;
    if (seen.has(key)) continue; // the per-sample JSON path is finer-grained when both exist
    seen.add(key);
    merged.push(r);
  }
  return merged;
}
