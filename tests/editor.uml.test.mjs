import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildOwnerMap, nearestClassAncestor, buildUmlClasses, classifyUmlEdges } from '../src/db-graph/editor/editor.uml.mjs';

function contains(source, target) {
  return { kind: 'CONTAINS', sourceQualified: source, targetQualified: target, confidence: 1, confidenceTier: 'DECLARED' };
}

function hasScript(source, target) {
  return { kind: 'HAS_SCRIPT', sourceQualified: source, targetQualified: target, confidence: 1, confidenceTier: 'DECLARED' };
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
  it('folds a public Method/Field into their owning class, dropping the raw member nodes', () => {
    const nodes = [
      { kind: 'Class', qualifiedName: 'Foo', name: 'Foo' },
      { kind: 'Method', qualifiedName: 'Foo.bar', name: 'bar', params: '[]', returnType: null, modifiers: ['public'] },
      { kind: 'Field', qualifiedName: 'Foo.count', name: 'count', returnType: 'integer' },
    ];
    const edges = [contains('Foo', 'Foo.bar'), contains('Foo', 'Foo.count')];

    const { nodes: result } = buildUmlClasses({ nodes, edges });

    assert.equal(result.length, 1);
    assert.equal(result[0].qualifiedName, 'Foo');
    assert.deepEqual(result[0].members.publicMethods, ['bar()']);
    assert.deepEqual(result[0].members.fields, ['count: integer']);
    assert.deepEqual(result[0].members.privateMethods, []);
  });

  it('renders a method signature with typed params', () => {
    const nodes = [
      { kind: 'Component', qualifiedName: 'Widget', name: 'Widget' },
      { kind: 'ComponentFunction', qualifiedName: 'Widget.init', name: 'init', params: JSON.stringify([{ name: 'x', type: 'integer' }]), returnType: 'void' },
    ];
    const edges = [contains('Widget', 'Widget.init')];

    const { nodes: result } = buildUmlClasses({ nodes, edges });

    assert.deepEqual(result[0].members.publicMethods, ['init(x as integer): void']);
  });

  it('a ComponentFunction (XML interface entry) is always public, regardless of any modifiers', () => {
    const nodes = [
      { kind: 'Component', qualifiedName: 'Widget', name: 'Widget' },
      { kind: 'ComponentFunction', qualifiedName: 'Widget.onShow', name: 'onShow', params: '[]', returnType: null },
    ];
    const edges = [contains('Widget', 'Widget.onShow')];

    const { nodes: result } = buildUmlClasses({ nodes, edges });

    assert.deepEqual(result[0].members.publicMethods, ['onShow()']);
  });

  it('a Method with a private access modifier goes to privateMethods', () => {
    const nodes = [
      { kind: 'Class', qualifiedName: 'Foo', name: 'Foo' },
      { kind: 'Method', qualifiedName: 'Foo.secret', name: 'secret', params: '[]', returnType: null, modifiers: ['private'] },
    ];
    const edges = [contains('Foo', 'Foo.secret')];

    const { nodes: result } = buildUmlClasses({ nodes, edges });

    assert.deepEqual(result[0].members.privateMethods, ['secret()']);
    assert.deepEqual(result[0].members.publicMethods, []);
  });

  it('a bare Function reached via the HAS_SCRIPT bridge (a component\'s internal .brs function, not declared in its XML interface) is private', () => {
    const nodes = [
      { kind: 'Component', qualifiedName: 'Widget', name: 'Widget' },
      { kind: 'File', qualifiedName: 'Widget.brs', name: 'Widget.brs' },
      { kind: 'Function', qualifiedName: 'Widget.brs::helper', name: 'helper', params: '[]', returnType: null },
    ];
    const edges = [hasScript('Widget', 'Widget.brs'), contains('Widget.brs', 'Widget.brs::helper')];

    const { nodes: result } = buildUmlClasses({ nodes, edges });

    assert.deepEqual(result[0].members.privateMethods, ['helper()']);
  });

  it('drops members that never reach a class-like ancestor', () => {
    const nodes = [{ kind: 'Function', qualifiedName: 'orphan.fn', name: 'fn' }];
    const { nodes: result } = buildUmlClasses({ nodes, edges: [] });
    assert.deepEqual(result, []);
  });

  it('defaults every section to visible, and stashes the same sectionVisibility onto every returned class', () => {
    const nodes = [
      { kind: 'Class', qualifiedName: 'A', name: 'A' },
      { kind: 'Class', qualifiedName: 'B', name: 'B' },
    ];
    const { nodes: result } = buildUmlClasses({ nodes, edges: [] });
    assert.deepEqual(result[0].sectionVisibility, { fields: true, publicMethods: true, privateMethods: true });
    assert.deepEqual(result[1].sectionVisibility, result[0].sectionVisibility);
  });

  it('threads showFields/showPublicMethods/showPrivateMethods through to sectionVisibility without dropping any collected members', () => {
    const nodes = [
      { kind: 'Class', qualifiedName: 'Foo', name: 'Foo' },
      { kind: 'Field', qualifiedName: 'Foo.count', name: 'count', returnType: 'integer' },
    ];
    const edges = [contains('Foo', 'Foo.count')];

    const { nodes: result } = buildUmlClasses({ nodes, edges }, { showFields: false, showPublicMethods: true, showPrivateMethods: false });

    assert.deepEqual(result[0].sectionVisibility, { fields: false, publicMethods: true, privateMethods: false });
    assert.deepEqual(result[0].members.fields, ['count: integer']);
  });
});

describe('editor.uml: classifyUmlEdges', () => {
  const classIds = new Set(['A', 'B']);
  const ownerMap = new Map([['A.m1', 'A'], ['B.m2', 'B']]);

  it('maps EXTENDS to relation INHERITANCE between two classes, keeping EXTENDS as kind', () => {
    const edges = [{ kind: 'EXTENDS', sourceQualified: 'A', targetQualified: 'B', confidence: 1 }];
    const result = classifyUmlEdges(edges, { classIds, ownerMap });
    assert.equal(result.length, 1);
    assert.equal(result[0].kind, 'EXTENDS');
    assert.equal(result[0].relation, 'INHERITANCE');
    assert.equal(result[0].sourceQualified, 'A');
    assert.equal(result[0].targetQualified, 'B');
  });

  it('retargets a member-to-member CALLS edge up to the owning classes, keeping CALLS as kind', () => {
    const edges = [{ kind: 'CALLS', sourceQualified: 'A.m1', targetQualified: 'B.m2', confidence: 1 }];
    const result = classifyUmlEdges(edges, { classIds, ownerMap });
    assert.equal(result.length, 1);
    assert.deepEqual([result[0].sourceQualified, result[0].targetQualified, result[0].kind, result[0].relation], ['A', 'B', 'CALLS', 'DEPENDENCY']);
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
    assert.equal(result[0].kind, 'SOME_UNKNOWN_KIND');
    assert.equal(result[0].relation, 'ASSOCIATION');
  });
});
