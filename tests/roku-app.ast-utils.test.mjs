import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { posOf, endLineOf, exprText, safe, classifyValueKind, nestedBlocksOf } from '../src/parse/roku-app/roku-app.ast-utils.mjs';
import { parseSnippet } from './helpers/parse-snippet.mjs';

function firstStatement(source) {
  const { file } = parseSnippet(source);
  return file.ast.statements[0];
}

describe('roku-app.ast-utils: posOf/endLineOf', () => {
  test('posOf returns 1-indexed line/col for a real AST node', () => {
    const stmt = firstStatement('\nfunction foo()\nend function\n');
    const pos = posOf(stmt);
    assert.equal(pos.line, 2);
    assert.equal(pos.col, 0);
  });

  test('posOf falls back to origin when node has no location', () => {
    const pos = posOf({});
    assert.deepEqual(pos, { line: 0, col: 0 });
  });

  test('posOf falls back to origin for null/undefined node', () => {
    assert.deepEqual(posOf(null), { line: 0, col: 0 });
    assert.deepEqual(posOf(undefined), { line: 0, col: 0 });
  });

  test('endLineOf returns 1-indexed end line', () => {
    const stmt = firstStatement('function foo()\nend function\n');
    assert.equal(endLineOf(stmt), 2);
  });

  test('endLineOf returns -1+1=0 fallback when node has no location', () => {
    assert.equal(endLineOf({}), 0);
  });
});

describe('roku-app.ast-utils: exprText', () => {
  test('resolves a plain variable reference', () => {
    const { file } = parseSnippet('function foo()\n  print x\nend function\n');
    const printStmt = file.ast.statements[0].func.body.statements[0];
    assert.equal(exprText(printStmt.expressions[0]), 'x');
  });

  test('resolves a dotted member-access chain', () => {
    const { file } = parseSnippet('function foo()\n  print m.top.field\nend function\n');
    const printStmt = file.ast.statements[0].func.body.statements[0];
    assert.equal(exprText(printStmt.expressions[0]), 'm.top.field');
  });

  test('returns null for a null/undefined node', () => {
    assert.equal(exprText(null), null);
    assert.equal(exprText(undefined), null);
  });
});

describe('roku-app.ast-utils: safe', () => {
  test('returns the function result when it does not throw', () => {
    assert.equal(safe(() => 42), 42);
  });

  test('returns undefined when the function throws', () => {
    assert.equal(safe(() => { throw new Error('boom'); }), undefined);
  });
});

describe('roku-app.ast-utils: classifyValueKind', () => {
  function firstAssignedValue(source) {
    const { file } = parseSnippet(source);
    return file.ast.statements[0].func.body.statements[0].value;
  }

  test('classifies an associative-array literal', () => {
    assert.equal(classifyValueKind(firstAssignedValue('function foo()\n  x = {}\nend function\n')), 'AssociativeArray');
  });

  test('classifies an array literal', () => {
    assert.equal(classifyValueKind(firstAssignedValue('function foo()\n  x = []\nend function\n')), 'Array');
  });

  test('classifies CreateObject("roSGNode", ...) as roSGNode', () => {
    assert.equal(classifyValueKind(firstAssignedValue('function foo()\n  x = CreateObject("roSGNode", "Group")\nend function\n')), 'roSGNode');
  });

  test('classifies CreateObject("roAssociativeArray") as AssociativeArray', () => {
    assert.equal(classifyValueKind(firstAssignedValue('function foo()\n  x = CreateObject("roAssociativeArray")\nend function\n')), 'AssociativeArray');
  });

  test('returns null for an unrelated call expression', () => {
    assert.equal(classifyValueKind(firstAssignedValue('function foo()\n  x = SomeOtherCall()\nend function\n')), null);
  });

  test('returns null for a bare variable reference (unknown from syntax alone)', () => {
    assert.equal(classifyValueKind(firstAssignedValue('function foo()\n  x = y\nend function\n')), null);
  });

  test('returns null for a null/undefined expression', () => {
    assert.equal(classifyValueKind(null), null);
    assert.equal(classifyValueKind(undefined), null);
  });
});

describe('roku-app.ast-utils: nestedBlocksOf', () => {
  test('returns then+else branches for an IfStatement', () => {
    const stmt = firstStatement('function foo()\n  if true then\n    print "a"\n  else\n    print "b"\n  end if\nend function\n').func.body.statements[0];
    const blocks = nestedBlocksOf(stmt);
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0][0].constructor.name, 'PrintStatement');
    assert.equal(blocks[1][0].constructor.name, 'PrintStatement');
  });

  test('returns only the then-branch for an IfStatement with no else', () => {
    const stmt = firstStatement('function foo()\n  if true then\n    print "a"\n  end if\nend function\n').func.body.statements[0];
    assert.equal(nestedBlocksOf(stmt).length, 1);
  });

  test('returns the loop body for a ForStatement', () => {
    const stmt = firstStatement('function foo()\n  for i = 0 to 10\n    print i\n  end for\nend function\n').func.body.statements[0];
    const blocks = nestedBlocksOf(stmt);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0][0].constructor.name, 'PrintStatement');
  });

  test('returns try+catch branches for a TryCatchStatement', () => {
    const stmt = firstStatement('function foo()\n  try\n    print "a"\n  catch e\n    print "b"\n  end try\nend function\n').func.body.statements[0];
    assert.equal(nestedBlocksOf(stmt).length, 2);
  });

  test('returns an empty array for a statement kind with no nested blocks', () => {
    const stmt = firstStatement('function foo()\n  print "a"\nend function\n').func.body.statements[0];
    assert.deepEqual(nestedBlocksOf(stmt), []);
  });
});
