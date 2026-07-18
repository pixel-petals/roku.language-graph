import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildOwnerMap, nearestClassAncestor, buildUmlClasses, classifyUmlEdges } from '../src/db-graph/editor/editor.uml.mjs';

function contains(source, target) {
  return { kind: 'CONTAINS', sourceQualified: source, targetQualified: target, confidence: 1, confidenceTier: 'DECLARED' };
}

describe('editor.uml: buildOwnerMap', () => {
  it('maps a CONTAINS edge target to its source', () => {
    const owner = buildOwnerMap([contains('A', 'A.m')]);
    assert.equal(owner.get('A.m'), 'A');
  });

  it('ignores non-CONTAINS edges', () => {
    const owner = buildOwnerMap([{ kind: 'CALLS', sourceQualified: 'A', targetQualified: 'B' }]);
    assert.equal(owner.size, 0);
  });
});

describe('editor.uml: nearestClassAncestor', () => {
  it('returns the node itself when it is already class-like', () => {
    const classIds = new Set(['A']);
    assert.equal(nearestClassAncestor('A', new Map(), classIds), 'A');
  });

  it('walks up through non-class owners to find a class ancestor', () => {
    const owner = new Map([['A.block.m', 'A.m'], ['A.m', 'A']]);
    const classIds = new Set(['A']);
    assert.equal(nearestClassAncestor('A.block.m', owner, classIds), 'A');
  });

  it('returns null when no class ancestor exists', () => {
    const owner = new Map([['orphan.m', 'orphan']]);
    assert.equal(nearestClassAncestor('orphan.m', owner, new Set(['A'])), null);
  });

  it('does not infinite-loop on a malformed CONTAINS cycle', () => {
    const owner = new Map([['X', 'Y'], ['Y', 'X']]);
    assert.equal(nearestClassAncestor('X', owner, new Set(['A'])), null);
  });
});

describe('editor.uml: buildUmlClasses', () => {
  it('folds Method/Field members into their owning class, dropping the raw member nodes', () => {
    const nodes = [
      { kind: 'Class', qualifiedName: 'Foo', name: 'Foo' },
      { kind: 'Method', qualifiedName: 'Foo.bar', name: 'bar', params: '[]', returnType: null },
      { kind: 'Field', qualifiedName: 'Foo.count', name: 'count', returnType: 'integer' },
    ];
    const edges = [contains('Foo', 'Foo.bar'), contains('Foo', 'Foo.count')];

    const { nodes: result } = buildUmlClasses({ nodes, edges });

    assert.equal(result.length, 1);
    assert.equal(result[0].qualifiedName, 'Foo');
    assert.deepEqual(result[0].members.methods, ['bar()']);
    assert.deepEqual(result[0].members.fields, ['count: integer']);
  });

  it('renders a method signature with typed params', () => {
    const nodes = [
      { kind: 'Component', qualifiedName: 'Widget', name: 'Widget' },
      { kind: 'ComponentFunction', qualifiedName: 'Widget.init', name: 'init', params: JSON.stringify([{ name: 'x', type: 'integer' }]), returnType: 'void' },
    ];
    const edges = [contains('Widget', 'Widget.init')];

    const { nodes: result } = buildUmlClasses({ nodes, edges });

    assert.deepEqual(result[0].members.methods, ['init(x as integer): void']);
  });

  it('drops members that never reach a class-like ancestor', () => {
    const nodes = [{ kind: 'Function', qualifiedName: 'orphan.fn', name: 'fn' }];
    const { nodes: result } = buildUmlClasses({ nodes, edges: [] });
    assert.deepEqual(result, []);
  });
});

describe('editor.uml: classifyUmlEdges', () => {
  const classIds = new Set(['A', 'B']);
  const ownerMap = new Map([['A.m1', 'A'], ['B.m2', 'B']]);

  it('maps EXTENDS to INHERITANCE between two classes', () => {
    const edges = [{ kind: 'EXTENDS', sourceQualified: 'A', targetQualified: 'B', confidence: 1 }];
    const result = classifyUmlEdges(edges, { classIds, ownerMap });
    assert.equal(result.length, 1);
    assert.equal(result[0].kind, 'INHERITANCE');
    assert.equal(result[0].sourceQualified, 'A');
    assert.equal(result[0].targetQualified, 'B');
  });

  it('retargets a member-to-member CALLS edge up to the owning classes', () => {
    const edges = [{ kind: 'CALLS', sourceQualified: 'A.m1', targetQualified: 'B.m2', confidence: 1 }];
    const result = classifyUmlEdges(edges, { classIds, ownerMap });
    assert.equal(result.length, 1);
    assert.deepEqual([result[0].sourceQualified, result[0].targetQualified, result[0].kind], ['A', 'B', 'DEPENDENCY']);
  });

  it('drops a self-loop once retargeted to the same class', () => {
    const edges = [{ kind: 'CALLS', sourceQualified: 'A.m1', targetQualified: 'A', confidence: 1 }];
    const result = classifyUmlEdges(edges, { classIds, ownerMap });
    assert.deepEqual(result, []);
  });

  it('drops CONTAINS edges (already consumed as class membership)', () => {
    const edges = [contains('A', 'A.m1')];
    const result = classifyUmlEdges(edges, { classIds, ownerMap });
    assert.deepEqual(result, []);
  });

  it('deduplicates multiple same-relation edges between the same class pair, keeping the highest confidence', () => {
    const edges = [
      { kind: 'CALLS', sourceQualified: 'A.m1', targetQualified: 'B.m2', confidence: 0.4 },
      { kind: 'CALLS', sourceQualified: 'A', targetQualified: 'B.m2', confidence: 0.9 },
    ];
    const result = classifyUmlEdges(edges, { classIds, ownerMap });
    assert.equal(result.length, 1);
    assert.equal(result[0].confidence, 0.9);
  });

  it('drops an edge whose endpoint never reaches a class ancestor', () => {
    const edges = [{ kind: 'CALLS', sourceQualified: 'A.m1', targetQualified: 'orphan.fn', confidence: 1 }];
    const result = classifyUmlEdges(edges, { classIds, ownerMap });
    assert.deepEqual(result, []);
  });

  it('falls back to ASSOCIATION for an edge kind with no explicit relation mapping', () => {
    const edges = [{ kind: 'SOME_UNKNOWN_KIND', sourceQualified: 'A', targetQualified: 'B', confidence: 1 }];
    const result = classifyUmlEdges(edges, { classIds, ownerMap });
    assert.equal(result[0].kind, 'ASSOCIATION');
  });
});
