import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toGraphData, dirname, basename, nodeFieldValue } from '../src/db-graph/db-graph.data.mjs';

function makeNode(overrides = {}) {
  return {
    kind: 'Function', name: 'foo', qualifiedName: 'components/Foo/file.brs::foo', filePath: 'components/Foo/file.brs',
    lineStart: 1, lineEnd: 2, language: 'brs', parentName: null,
    ...overrides,
  };
}

function makeEdge(overrides = {}) {
  return {
    kind: 'CALLS', sourceQualified: 'components/Foo/file.brs::foo', targetQualified: 'components/Foo/file.brs::bar',
    filePath: 'components/Foo/file.brs', line: 1, confidence: 1, confidenceTier: 'DECLARED',
    ...overrides,
  };
}

describe('db-graph.data: dirname/basename', () => {
  it('splits a nested path into its directory and file parts', () => {
    assert.equal(dirname('components/Foo/file.brs'), 'components/Foo');
    assert.equal(basename('components/Foo/file.brs'), 'file.brs');
  });

  it('treats a bare filename (no separator) as having no directory', () => {
    assert.equal(dirname('file.brs'), '.');
    assert.equal(basename('file.brs'), 'file.brs');
  });
});

describe('db-graph.data: nodeFieldValue', () => {
  it('derives folder from filePath even though it is not a stored column', () => {
    assert.equal(nodeFieldValue(makeNode(), 'folder'), 'components/Foo');
  });

  it('reads any other field directly off the node', () => {
    assert.equal(nodeFieldValue(makeNode(), 'kind'), 'Function');
  });
});

describe('db-graph.data: toGraphData', () => {
  it('maps a node to its G6 id/data shape, clustered into its containing folder by default', () => {
    // Arrange
    const graph = { nodes: [makeNode()], edges: [] };

    // Act
    const result = toGraphData(graph, { comboField: 'folder' });

    // Assert
    assert.deepEqual(result.nodes, [{
      id: 'components/Foo/file.brs::foo',
      combo: 'components/Foo',
      data: {
        kind: 'Function', name: 'foo', filePath: 'components/Foo/file.brs', lineStart: 1, lineEnd: 2,
        language: 'brs', parentName: null, folder: 'components/Foo',
      },
    }]);
  });

  it('builds one combo per distinct folder, labeled with the folder\'s own name', () => {
    // Arrange
    const graph = {
      nodes: [makeNode(), makeNode({ name: 'bar', qualifiedName: 'components/Bar/file.brs::bar', filePath: 'components/Bar/file.brs' })],
      edges: [],
    };

    // Act
    const result = toGraphData(graph, { comboField: 'folder' });

    // Assert
    assert.deepEqual(result.combos, [
      { id: 'components/Foo', data: { label: 'Foo' } },
      { id: 'components/Bar', data: { label: 'Bar' } },
    ]);
  });

  it('clusters by an arbitrary field (e.g. kind) when asked, using the raw value as the combo label', () => {
    // Arrange
    const graph = {
      nodes: [makeNode(), makeNode({ name: 'bar', qualifiedName: 'components/Foo/file.brs::bar', kind: 'Field' })],
      edges: [],
    };

    // Act
    const result = toGraphData(graph, { comboField: 'kind' });

    // Assert
    assert.deepEqual(result.combos, [
      { id: 'Function', data: { label: 'Function' } },
      { id: 'Field', data: { label: 'Field' } },
    ]);
  });

  it('omits combo assignment and returns no combos by default (comboField unset)', () => {
    // Arrange
    const graph = { nodes: [makeNode()], edges: [] };

    // Act
    const result = toGraphData(graph);

    // Assert
    assert.equal(result.nodes[0].combo, undefined);
    assert.deepEqual(result.combos, []);
  });

  it('maps an edge whose endpoints both exist to its G6 id/source/target/data shape', () => {
    // Arrange
    const graph = {
      nodes: [makeNode(), makeNode({ name: 'bar', qualifiedName: 'components/Foo/file.brs::bar' })],
      edges: [makeEdge()],
    };

    // Act
    const result = toGraphData(graph);

    // Assert
    assert.deepEqual(result.edges, [{
      id: 'e0',
      source: 'components/Foo/file.brs::foo',
      target: 'components/Foo/file.brs::bar',
      data: { kind: 'CALLS', filePath: 'components/Foo/file.brs', line: 1, confidence: 1, confidenceTier: 'DECLARED' },
    }]);
  });

  it('drops an edge whose target node is not present in the same graph', () => {
    // Arrange
    const graph = {
      nodes: [makeNode()],
      edges: [makeEdge({ targetQualified: 'sdk::SomeType' })],
    };

    // Act
    const result = toGraphData(graph);

    // Assert
    assert.deepEqual(result.edges, []);
  });
});
