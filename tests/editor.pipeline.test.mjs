import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fieldValueOf, matchesFilter, valueOptionsFor, summarizeValues } from '../src/db-graph/editor/editor.pipeline.mjs';

function makeNode(overrides = {}) {
  return { kind: 'Function', name: 'foo', filePath: 'components/Foo/file.brs', ...overrides };
}

describe('editor.pipeline: fieldValueOf', () => {
  it('derives folder from filePath even though it is not a stored column', () => {
    assert.equal(fieldValueOf(makeNode(), 'folder'), 'components/Foo');
  });

  it('reads any other field directly off the record', () => {
    assert.equal(fieldValueOf(makeNode(), 'kind'), 'Function');
  });
});

describe('editor.pipeline: matchesFilter', () => {
  it('passes everything through when no values are selected (empty filter is a no-op)', () => {
    assert.equal(matchesFilter(makeNode(), 'kind', 'is one of', []), true);
  });

  it('"is one of" matches when the field value is in the selected set', () => {
    assert.equal(matchesFilter(makeNode(), 'kind', 'is one of', ['Function', 'Field']), true);
  });

  it('"is one of" rejects when the field value is not in the selected set', () => {
    assert.equal(matchesFilter(makeNode(), 'kind', 'is one of', ['Field']), false);
  });

  it('"is not one of" inverts "is one of"', () => {
    assert.equal(matchesFilter(makeNode(), 'kind', 'is not one of', ['Field']), true);
  });

  it('"is" matches only the exact single value', () => {
    assert.equal(matchesFilter(makeNode(), 'kind', 'is', ['Function']), true);
    assert.equal(matchesFilter(makeNode(), 'kind', 'is', ['Field']), false);
  });

  it('"contains" does a substring match', () => {
    assert.equal(matchesFilter(makeNode(), 'filePath', 'contains', ['Foo']), true);
    assert.equal(matchesFilter(makeNode(), 'filePath', 'contains', ['Bar']), false);
  });
});

describe('editor.pipeline: valueOptionsFor', () => {
  it('counts distinct values of a field, sorted by frequency descending', () => {
    const records = [makeNode({ kind: 'Function' }), makeNode({ kind: 'Function' }), makeNode({ kind: 'Field' })];

    const result = valueOptionsFor(records, 'kind');

    assert.deepEqual(result, [{ value: 'Function', count: 2 }, { value: 'Field', count: 1 }]);
  });

  it('excludes null/undefined/empty-string values from the option list', () => {
    const records = [makeNode({ parentName: null }), makeNode({ parentName: 'Owner' })];

    const result = valueOptionsFor(records, 'parentName');

    assert.deepEqual(result, [{ value: 'Owner', count: 1 }]);
  });
});

describe('editor.pipeline: summarizeValues', () => {
  it('shows "(any)" for an empty selection', () => {
    assert.equal(summarizeValues([]), '(any)');
  });

  it('lists values directly when there are two or fewer', () => {
    assert.equal(summarizeValues(['Function', 'Field']), 'Function, Field');
  });

  it('truncates with a "+N" suffix beyond two values', () => {
    assert.equal(summarizeValues(['Function', 'Field', 'Class', 'Enum']), 'Function, Field (+2)');
  });
});
