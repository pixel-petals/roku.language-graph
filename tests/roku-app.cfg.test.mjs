import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildFunctionCfg } from '../src/parse/roku-app/roku-app.cfg.mjs';
import { firstFunctionExpr } from './helpers/parse-snippet.mjs';

describe('roku-app.cfg: buildFunctionCfg metrics', () => {
  test('a straight-line function has cyclomatic complexity 1 and no branching', () => {
    const func = firstFunctionExpr('function foo()\n  x = 1\n  y = 2\nend function\n');
    const { metrics } = buildFunctionCfg(func, 'test::foo', 'test.brs');
    assert.equal(metrics.cyclomaticComplexity, 1);
    assert.equal(metrics.maxNestingDepth, 0);
    assert.equal(metrics.loopNestingDepth, 0);
    assert.equal(metrics.estimatedBigO, 'O(1)');
  });

  test('a single if statement increments cyclomatic complexity by 1', () => {
    const func = firstFunctionExpr('function foo()\n  if true then\n    print "a"\n  end if\nend function\n');
    const { metrics } = buildFunctionCfg(func, 'test::foo', 'test.brs');
    assert.equal(metrics.cyclomaticComplexity, 2);
    assert.equal(metrics.maxNestingDepth, 1);
  });

  test('a single loop is reflected in loopNestingDepth and Big-O', () => {
    const func = firstFunctionExpr('function foo()\n  for i = 0 to 10\n    print i\n  end for\nend function\n');
    const { metrics } = buildFunctionCfg(func, 'test::foo', 'test.brs');
    assert.equal(metrics.loopNestingDepth, 1);
    assert.equal(metrics.estimatedBigO, 'O(n)');
  });

  test('nested loops produce O(n^2)', () => {
    const func = firstFunctionExpr('function foo()\n  for i = 0 to 10\n    for j = 0 to 10\n      print j\n    end for\n  end for\nend function\n');
    const { metrics } = buildFunctionCfg(func, 'test::foo', 'test.brs');
    assert.equal(metrics.loopNestingDepth, 2);
    assert.equal(metrics.estimatedBigO, 'O(n^2)');
  });

  test('exitPointCount is at least 1 even with no explicit return', () => {
    const func = firstFunctionExpr('function foo()\n  x = 1\nend function\n');
    const { metrics } = buildFunctionCfg(func, 'test::foo', 'test.brs');
    assert.equal(metrics.exitPointCount, 1);
  });

  test('multiple return statements are counted', () => {
    const func = firstFunctionExpr('function foo(x)\n  if x then\n    return 1\n  end if\n  return 2\nend function\n');
    const { metrics } = buildFunctionCfg(func, 'test::foo', 'test.brs');
    assert.equal(metrics.exitPointCount, 2);
  });
});

describe('roku-app.cfg: buildFunctionCfg graph shape', () => {
  test('every FLOWS_TO edge references a block that was actually finalized (no dangling edges)', () => {
    const func = firstFunctionExpr(`
function foo(x)
  if x = 1 then
    print "a"
  else if x = 2 then
    print "b"
  else
    print "c"
  end if
  for i = 0 to 10
    if i = 5 then
      exit for
    end if
  end for
end function
`);
    const { nodes, edges } = buildFunctionCfg(func, 'test::foo', 'test.brs');
    const blockQnames = new Set(nodes.map(n => n.qualifiedName));
    for (const edge of edges) {
      if (edge.sourceQualified !== 'test::foo') assert.ok(blockQnames.has(edge.sourceQualified), `dangling source: ${edge.sourceQualified}`);
      if (edge.targetQualified !== 'test::foo') assert.ok(blockQnames.has(edge.targetQualified), `dangling target: ${edge.targetQualified}`);
    }
  });

  test('an if/else produces then/else/merge branch-tagged edges', () => {
    const func = firstFunctionExpr('function foo(x)\n  if x then\n    print "a"\n  else\n    print "b"\n  end if\nend function\n');
    const { edges } = buildFunctionCfg(func, 'test::foo', 'test.brs');
    const branches = edges.map(e => e.extra.branch);
    assert.ok(branches.includes('then'));
    assert.ok(branches.includes('else'));
    assert.ok(branches.includes('merge'));
  });

  test('a return statement flows directly back to the function qname, not a merge block', () => {
    const func = firstFunctionExpr('function foo()\n  return 1\nend function\n');
    const { edges } = buildFunctionCfg(func, 'test::foo', 'test.brs');
    const returnEdge = edges.find(e => e.extra.branch === 'return');
    assert.ok(returnEdge);
    assert.equal(returnEdge.targetQualified, 'test::foo');
  });
});
