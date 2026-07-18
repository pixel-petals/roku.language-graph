import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifyBenchmarkRow, partitionCatalog } from '../src/parse/roku-benchmark/roku-benchmark.classify.mjs';

describe('roku-benchmark.classify: classifyBenchmarkRow', () => {
  test('classifies an operation mentioning roSGNode as SceneGraph', () => {
    assert.equal(classifyBenchmarkRow({ operation: 'Create a roSGNode and set a field' }), 'SceneGraph');
  });

  test('classifies an operation mentioning m.global as SceneGraph', () => {
    assert.equal(classifyBenchmarkRow({ operation: 'Read a value from m.global' }), 'SceneGraph');
  });

  test('classifies a plain array/string operation as BrightScript', () => {
    assert.equal(classifyBenchmarkRow({ operation: 'Concatenate two strings with +' }), 'BrightScript');
  });

  test('is case-insensitive', () => {
    assert.equal(classifyBenchmarkRow({ operation: 'ROSGNODE creation' }), 'SceneGraph');
  });
});

describe('roku-benchmark.classify: partitionCatalog', () => {
  test('splits rows into sceneGraph and brightScript buckets', () => {
    const rows = [
      { suiteName: 'A', testName: 't1', operation: 'roSGNode field access' },
      { suiteName: 'B', testName: 't1', operation: 'string concat' },
    ];
    const { sceneGraph, brightScript } = partitionCatalog(rows);
    assert.equal(sceneGraph.length, 1);
    assert.equal(brightScript.length, 1);
    assert.equal(sceneGraph[0].suiteName, 'A');
    assert.equal(brightScript[0].suiteName, 'B');
  });

  test('tags rows from a suite whose members land in both categories as comparativeSuite', () => {
    const rows = [
      { suiteName: 'mVsField', testName: 'node field', operation: 'roSGNode field get' },
      { suiteName: 'mVsField', testName: 'm prop', operation: 'read from m associative array' },
    ];
    const { sceneGraph, brightScript } = partitionCatalog(rows);
    assert.equal(sceneGraph[0].comparativeSuite, true);
    assert.equal(brightScript[0].comparativeSuite, true);
  });

  test('does not tag comparativeSuite on a suite whose rows are all in one category', () => {
    const rows = [
      { suiteName: 'AllStrings', testName: 't1', operation: 'string concat' },
      { suiteName: 'AllStrings', testName: 't2', operation: 'string split' },
    ];
    const { brightScript } = partitionCatalog(rows);
    assert.equal(brightScript[0].comparativeSuite, undefined);
    assert.equal(brightScript[1].comparativeSuite, undefined);
  });

  test('handles an empty catalog', () => {
    const { sceneGraph, brightScript } = partitionCatalog([]);
    assert.deepEqual(sceneGraph, []);
    assert.deepEqual(brightScript, []);
  });
});
