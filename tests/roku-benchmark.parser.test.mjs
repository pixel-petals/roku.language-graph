import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractSamples, aggregateSamples, extractFinalResultsTables, parseBsbenchOutput } from '../src/parse/roku-benchmark/roku-benchmark.parser.mjs';

describe('roku-benchmark.parser: extractSamples', () => {
  test('parses well-formed bsbenchStatus JSON lines', () => {
    const raw = [
      'some unrelated log line',
      'bsbenchStatus: {"suiteName":"Baseline","testName":"noop","sampleNumber":1,"iterations":100,"elapsedMicroseconds":600}',
      'bsbenchStatus: {"suiteName":"Baseline","testName":"noop","sampleNumber":2,"iterations":100,"elapsedMicroseconds":700}',
    ].join('\n');
    const samples = extractSamples(raw);
    assert.equal(samples.length, 2);
    assert.equal(samples[0].suiteName, 'Baseline');
    assert.equal(samples[1].elapsedMicroseconds, 700);
  });

  test('silently skips a malformed/truncated status line rather than throwing', () => {
    const raw = 'bsbenchStatus: {"suiteName":"Baseline", not valid json';
    assert.doesNotThrow(() => extractSamples(raw));
    assert.deepEqual(extractSamples(raw), []);
  });

  test('returns an empty array when no status lines are present', () => {
    assert.deepEqual(extractSamples('nothing here'), []);
  });
});

describe('roku-benchmark.parser: aggregateSamples', () => {
  test('aggregates multiple samples of the same test into one row with median/min/max', () => {
    const samples = [
      { suiteName: 'Baseline', testName: 'noop', sampleNumber: 1, iterations: 100, elapsedMicroseconds: 100 },
      { suiteName: 'Baseline', testName: 'noop', sampleNumber: 2, iterations: 100, elapsedMicroseconds: 200 },
      { suiteName: 'Baseline', testName: 'noop', sampleNumber: 3, iterations: 100, elapsedMicroseconds: 300 },
    ];
    const [row] = aggregateSamples(samples);
    assert.equal(row.microsecondsPerOp, 2); // median of [1,2,3] us/op
    assert.equal(row.min, 1);
    assert.equal(row.max, 3);
    assert.equal(row.sampleCount, 3);
  });

  test('keeps separate tests in separate rows', () => {
    const samples = [
      { suiteName: 'A', testName: 't1', sampleNumber: 1, iterations: 1, elapsedMicroseconds: 10 },
      { suiteName: 'A', testName: 't2', sampleNumber: 1, iterations: 1, elapsedMicroseconds: 20 },
    ];
    const rows = aggregateSamples(samples);
    assert.equal(rows.length, 2);
  });
});

describe('roku-benchmark.parser: extractFinalResultsTables', () => {
  test('extracts rows from a µs/op-labeled table', () => {
    const raw = [
      'Baseline -- FINAL RESULTS',
      '------------------------------------------------------------',
      '                               main          render',
      '------------------------------------------------------------',
      'does literally nothing:       0.06          0.07',
      '------------------------------------------------------------',
      '(all values in µs/op)',
    ].join('\n');
    const results = extractFinalResultsTables(raw);
    assert.equal(results.length, 1);
    assert.equal(results[0].suiteName, 'Baseline');
    assert.equal(results[0].testName, 'does literally nothing');
    assert.equal(results[0].microsecondsPerOp, 0.06);
  });

  test('skips a table labeled ops/sec (not a microsecond unit)', () => {
    const raw = [
      'Baseline -- FINAL RESULTS',
      '------------------------------------------------------------',
      '                               main',
      '------------------------------------------------------------',
      'does literally nothing:       16666666',
      '------------------------------------------------------------',
      '(all values in ops/sec)',
    ].join('\n');
    assert.deepEqual(extractFinalResultsTables(raw), []);
  });

  test('returns an empty array when no FINAL RESULTS section is present', () => {
    assert.deepEqual(extractFinalResultsTables('nothing relevant here'), []);
  });

  test('microsecondsPerOp prefers the "main" thread column when present', () => {
    const raw = [
      'Baseline -- FINAL RESULTS',
      '                               render        main',
      'does literally nothing:       9.99          0.06',
      '',
      '(all values in µs/op)',
    ].join('\n');
    const [row] = extractFinalResultsTables(raw);
    assert.equal(row.microsecondsPerOp, 0.06);
  });
});

describe('roku-benchmark.parser: parseBsbenchOutput precedence', () => {
  test('JSON per-sample data wins over a FINAL RESULTS table for the same test', () => {
    const raw = [
      'bsbenchStatus: {"suiteName":"Baseline","testName":"noop","sampleNumber":1,"iterations":100,"elapsedMicroseconds":500}',
      'Baseline -- FINAL RESULTS',
      '                               main',
      'noop:                          99.9',
      '(all values in µs/op)',
    ].join('\n');
    const results = parseBsbenchOutput(raw);
    assert.equal(results.length, 1);
    assert.equal(results[0].microsecondsPerOp, 5); // from JSON (500us/100 iterations), not the table's 99.9
  });

  test('falls back to table data when no JSON samples exist for that test', () => {
    const raw = [
      'Baseline -- FINAL RESULTS',
      '                               main',
      'noop:                          0.06',
      '',
      '(all values in µs/op)',
    ].join('\n');
    const results = parseBsbenchOutput(raw);
    assert.equal(results.length, 1);
    assert.equal(results[0].microsecondsPerOp, 0.06);
  });
});
