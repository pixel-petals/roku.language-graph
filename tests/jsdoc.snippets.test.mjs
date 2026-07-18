import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SNIPPETS } from '../src/parse/jsdoc/jsdoc.snippets.mjs';

describe('jsdoc.snippets: SNIPPETS templates', () => {
  test('Function snippet uses "function" keyword and includes params', () => {
    const source = SNIPPETS.Function({ name: 'add', commentBlock: "\n' does a thing", params: [{ name: 'a', type: 'integer' }, { name: 'b' }] });
    assert.match(source, /function add\(a as integer, b\)\nend function/);
  });

  test('Function snippet with isSub uses "sub" keyword and omits return type', () => {
    const source = SNIPPETS.Function({ name: 'run', commentBlock: '\n', params: [], isSub: true, returnType: 'void' });
    assert.match(source, /sub run\(\)\nend sub/);
    assert.doesNotMatch(source, /as void/);
  });

  test('Function snippet includes "as <returnType>" when not a sub', () => {
    const source = SNIPPETS.Function({ name: 'get', commentBlock: '\n', params: [], isSub: false, returnType: 'string' });
    assert.match(source, /function get\(\) as string/);
  });

  test('Method uses the same template as Function', () => {
    assert.equal(SNIPPETS.Method, SNIPPETS.Function);
  });

  test('Class snippet wraps the name in class/end class', () => {
    const source = SNIPPETS.Class({ name: 'Foo', commentBlock: '\n' });
    assert.match(source, /class Foo\nend class/);
  });

  test('Field snippet wraps the field in a synthetic class with its declared type', () => {
    const source = SNIPPETS.Field({ name: 'count', commentBlock: '\n', returnType: 'integer' });
    assert.match(source, /class Wrapper/);
    assert.match(source, /count as integer/);
  });

  test('Field snippet defaults to "dynamic" when no returnType is given', () => {
    const source = SNIPPETS.Field({ name: 'count', commentBlock: '\n' });
    assert.match(source, /count as dynamic/);
  });
});
