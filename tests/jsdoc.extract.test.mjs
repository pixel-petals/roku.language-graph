import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractJsDoc } from '../src/parse/jsdoc/jsdoc.extract.mjs';

describe('jsdoc.extract: extractJsDoc success paths', () => {
  test('a doc comment produces a JSDoc block with the description preserved', () => {
    const result = extractJsDoc({ kind: 'Function', name: 'add', doc: 'Adds two numbers', params: [{ name: 'a' }, { name: 'b' }] });
    assert.equal(Object.hasOwn(result, 'jsdocError'), false);
    assert.match(result.jsdoc, /Adds two numbers/);
    assert.match(result.jsdoc, /@param.*a/);
  });

  test('no doc comment returns an explicit empty-string jsdoc (not omitted)', () => {
    const result = extractJsDoc({ kind: 'Function', name: 'add', doc: null, params: [] });
    assert.deepEqual(result, { jsdoc: '' });
  });

  test('a kind with no snippet template returns an explicit empty-string jsdoc', () => {
    const result = extractJsDoc({ kind: 'BasicBlock', name: 'block:0', doc: 'some doc' });
    assert.deepEqual(result, { jsdoc: '' });
  });

  test('@param tag overrides in the source comment are reflected in the output', () => {
    const result = extractJsDoc({
      kind: 'Function', name: 'add', params: [{ name: 'a' }],
      doc: 'Adds a number\n@param {integer} a the value to add',
    });
    assert.match(result.jsdoc, /@param \{integer\} a the value to add/);
  });
});

describe('jsdoc.extract: extractJsDoc failure path', () => {
  test('a synthesis failure returns jsdocError instead of throwing, with no jsdoc key', () => {
    // params as a non-array forces buildSnippet's internal .map to throw
    const result = extractJsDoc({ kind: 'Function', name: 'foo', doc: 'test', params: { not: 'an array' } });
    assert.deepEqual(result, { jsdocError: true });
    assert.equal(Object.hasOwn(result, 'jsdoc'), false);
  });
});
