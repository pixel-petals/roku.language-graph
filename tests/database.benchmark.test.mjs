import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadCostModel, benchmarkOpNodes, estimateMicroseconds } from '../src/database/database.benchmark.mjs';

describe('database.benchmark: loadCostModel', () => {
  test('loads the checked-in catalog with a rows array and a byKey lookup', () => {
    const costModel = loadCostModel();
    assert.ok(Array.isArray(costModel.rows));
    assert.ok(costModel.rows.length > 0);
    assert.ok(costModel.byKey instanceof Map);
    const [row] = costModel.rows;
    assert.equal(costModel.byKey.get(`${row.suiteName}::${row.testName}`), row);
  });
});

describe('database.benchmark: benchmarkOpNodes', () => {
  test('maps each catalog row to a BenchmarkOp node with a bench: qualified name', () => {
    const rows = [{ suiteName: 'Baseline', testName: 'noop', operation: 'do nothing', testFile: 'Baseline.bs', microsecondsPerOp: 0.06, sampleCount: 10, min: 0.05, max: 0.07, measuredAt: '2026-01-01' }];
    const [node] = benchmarkOpNodes({ rows });
    assert.equal(node.kind, 'BenchmarkOp');
    assert.equal(node.qualifiedName, 'bench:Baseline:noop');
    assert.equal(node.extra.microsecondsPerOp, 0.06);
    assert.equal(node.extra.source, 'bsbench');
  });

  test('defaults comparativeSuite to false when the row does not set it', () => {
    const rows = [{ suiteName: 'A', testName: 't', operation: 'x', testFile: 'A.bs' }];
    const [node] = benchmarkOpNodes({ rows });
    assert.equal(node.extra.comparativeSuite, false);
  });

  test('returns an empty array for an empty catalog', () => {
    assert.deepEqual(benchmarkOpNodes({ rows: [] }), []);
  });
});

describe('database.benchmark: estimateMicroseconds', () => {
  const costModel = {
    byKey: new Map([
      ['RoSGNodeCreation::node', { microsecondsPerOp: 1.5 }],
      ['Md5::small', { microsecondsPerOp: null }], // known op, not yet measured
    ]),
  };

  test('matches CreateObject to the RoSGNodeCreation benchmark', () => {
    const result = estimateMicroseconds('CreateObject', costModel);
    assert.equal(result.microseconds, 1.5);
    assert.equal(result.benchmarkOpQualifiedName, 'bench:RoSGNodeCreation:node');
  });

  test('is case-insensitive on the callee text', () => {
    const result = estimateMicroseconds('createobject', costModel);
    assert.ok(result);
  });

  test('returns null when the matching rule exists but has not been measured yet', () => {
    assert.equal(estimateMicroseconds('md5', costModel), null);
  });

  test('returns null when no alias rule matches the callee text', () => {
    assert.equal(estimateMicroseconds('SomeUnrelatedFunction', costModel), null);
  });

  test('returns null for a null/empty callee text', () => {
    assert.equal(estimateMicroseconds(null, costModel), null);
    assert.equal(estimateMicroseconds('', costModel), null);
  });
});
