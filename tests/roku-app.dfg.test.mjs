import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildFunctionDfg } from '../src/parse/roku-app/roku-app.dfg.mjs';
import { firstFunctionExpr } from './helpers/parse-snippet.mjs';

describe('roku-app.dfg: LocalDef nodes', () => {
  test('a simple assignment produces one LocalDef node', () => {
    const func = firstFunctionExpr('function foo()\n  x = 1\nend function\n');
    const { nodes } = buildFunctionDfg(func, 'test::foo', 'test.brs', 'brightscript');
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].kind, 'LocalDef');
    assert.equal(nodes[0].name, 'x');
  });

  test('a function parameter produces a LocalDef node', () => {
    const func = firstFunctionExpr('function foo(a as integer)\n  print a\nend function\n');
    const { nodes } = buildFunctionDfg(func, 'test::foo', 'test.brs', 'brightscript');
    const paramDef = nodes.find(n => n.name === 'a');
    assert.ok(paramDef, 'expected a LocalDef for parameter "a"');
  });

  test('a for-loop counter produces a LocalDef node', () => {
    const func = firstFunctionExpr('function foo()\n  for i = 0 to 10\n    print i\n  end for\nend function\n');
    const { nodes } = buildFunctionDfg(func, 'test::foo', 'test.brs', 'brightscript');
    assert.ok(nodes.some(n => n.name === 'i'), 'expected a LocalDef for loop counter "i"');
  });
});

describe('roku-app.dfg: USES edges', () => {
  test('a read after a def resolves to that def', () => {
    const func = firstFunctionExpr('function foo()\n  x = 1\n  print x\nend function\n');
    const { edges } = buildFunctionDfg(func, 'test::foo', 'test.brs', 'brightscript');
    assert.equal(edges.length, 1);
    assert.equal(edges[0].kind, 'USES');
    assert.equal(edges[0].targetQualified, 'test::foo::def:x@2');
    assert.equal(edges[0].confidenceTier, 'TEXTUAL');
  });

  test('a read on the same line as its own assignment does not self-resolve', () => {
    const func = firstFunctionExpr('function foo()\n  x = 1\n  x = x + 1\nend function\n');
    const { edges } = buildFunctionDfg(func, 'test::foo', 'test.brs', 'brightscript');
    // the read of x on line 3 should resolve to the def on line 2, not line 3
    assert.equal(edges.length, 1);
    assert.equal(edges[0].targetQualified, 'test::foo::def:x@2');
  });

  test('a read with no preceding def produces no USES edge', () => {
    const func = firstFunctionExpr('function foo()\n  print undefinedVar\nend function\n');
    const { edges } = buildFunctionDfg(func, 'test::foo', 'test.brs', 'brightscript');
    assert.equal(edges.length, 0);
  });

  test('a read of the call callee itself is not treated as a variable use', () => {
    const func = firstFunctionExpr('function foo()\n  myFunc = 1\n  myFunc()\nend function\n');
    const { edges } = buildFunctionDfg(func, 'test::foo', 'test.brs', 'brightscript');
    assert.equal(edges.length, 0);
  });

  test('a later reassignment shadows an earlier def for subsequent reads', () => {
    const func = firstFunctionExpr('function foo()\n  x = 1\n  x = 2\n  print x\nend function\n');
    const { edges } = buildFunctionDfg(func, 'test::foo', 'test.brs', 'brightscript');
    assert.equal(edges.length, 1);
    assert.equal(edges[0].targetQualified, 'test::foo::def:x@3');
  });
});
