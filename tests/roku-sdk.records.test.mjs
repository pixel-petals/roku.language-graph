import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { toGraphRecords, partitionRecords } from '../src/parse/roku-sdk/roku-sdk.records.mjs';

function makeRaw({ nodes, links }) {
  return { directed: true, graph: { label: 'test', source: '/sdk-docs' }, nodes, links };
}

describe('roku-sdk.records: toGraphRecords', () => {
  test('a method node gets its real owner via the has_method link, not an assumed prefix', () => {
    const raw = makeRaw({
      nodes: [
        { id: 'ro:roArray', label: 'roArray', type: 'Node' },
        { id: 'fn:roArray:Push', label: 'Push', type: 'function' },
      ],
      links: [{ source: 'ro:roArray', target: 'fn:roArray:Push', relation: 'has_method' }],
    });
    const { nodes } = toGraphRecords(raw);
    const fn = nodes.find(n => n.qualifiedName === 'fn:roArray:Push');
    assert.equal(fn.parentName, 'ro:roArray');
  });

  test('a method owned by an sg: SceneGraph component also resolves correctly (not assumed if:)', () => {
    const raw = makeRaw({
      nodes: [
        { id: 'sg:Label', label: 'Label', type: 'roSGNode' },
        { id: 'fn:Label:setText', label: 'setText', type: 'function' },
      ],
      links: [{ source: 'sg:Label', target: 'fn:Label:setText', relation: 'has_method' }],
    });
    const { nodes } = toGraphRecords(raw);
    const fn = nodes.find(n => n.qualifiedName === 'fn:Label:setText');
    assert.equal(fn.parentName, 'sg:Label');
  });

  test('a field node uses its owner field from the raw node, prefixed sg:', () => {
    const raw = makeRaw({
      nodes: [
        { id: 'sg:Label', label: 'Label', type: 'roSGNode' },
        { id: 'field:Label:text', label: 'text', type: 'field', owner: 'Label' },
      ],
      links: [{ source: 'sg:Label', target: 'field:Label:text', relation: 'has_field' }],
    });
    const { nodes } = toGraphRecords(raw);
    const field = nodes.find(n => n.qualifiedName === 'field:Label:text');
    assert.equal(field.parentName, 'sg:Label');
  });

  test('edges carry through with DECLARED confidence tier', () => {
    const raw = makeRaw({
      nodes: [{ id: 'ro:A', label: 'A', type: 'Node' }, { id: 'if:B', label: 'B', type: 'interface' }],
      links: [{ source: 'ro:A', target: 'if:B', relation: 'implements' }],
    });
    const { edges } = toGraphRecords(raw);
    assert.equal(edges[0].kind, 'IMPLEMENTS');
    assert.equal(edges[0].confidenceTier, 'DECLARED');
    assert.equal(edges[0].confidence, 1.0);
  });
});

describe('roku-sdk.records: partitionRecords', () => {
  test('sg: and field: nodes go to sceneGraph', () => {
    const raw = makeRaw({
      nodes: [
        { id: 'sg:Label', label: 'Label', type: 'roSGNode' },
        { id: 'field:Label:text', label: 'text', type: 'field', owner: 'Label' },
      ],
      links: [],
    });
    const { nodes } = toGraphRecords(raw);
    const { sceneGraph, brightScript } = partitionRecords(nodes, []);
    assert.equal(sceneGraph.nodes.length, 2);
    assert.equal(brightScript.nodes.length, 0);
  });

  test('ro: and if: nodes go to brightScript', () => {
    const raw = makeRaw({
      nodes: [
        { id: 'ro:roArray', label: 'roArray', type: 'Node' },
        { id: 'if:ifArray', label: 'ifArray', type: 'interface' },
      ],
      links: [],
    });
    const { nodes } = toGraphRecords(raw);
    const { sceneGraph, brightScript } = partitionRecords(nodes, []);
    assert.equal(brightScript.nodes.length, 2);
    assert.equal(sceneGraph.nodes.length, 0);
  });

  test('a function node is categorized by its resolved owner, not its own fn: prefix', () => {
    const raw = makeRaw({
      nodes: [
        { id: 'sg:Label', label: 'Label', type: 'roSGNode' },
        { id: 'fn:Label:setText', label: 'setText', type: 'function' },
        { id: 'ro:roArray', label: 'roArray', type: 'Node' },
        { id: 'fn:roArray:Push', label: 'Push', type: 'function' },
      ],
      links: [
        { source: 'sg:Label', target: 'fn:Label:setText', relation: 'has_method' },
        { source: 'ro:roArray', target: 'fn:roArray:Push', relation: 'has_method' },
      ],
    });
    const { nodes, edges } = toGraphRecords(raw);
    const { sceneGraph, brightScript } = partitionRecords(nodes, edges);

    assert.ok(sceneGraph.nodes.some(n => n.qualifiedName === 'fn:Label:setText'));
    assert.ok(brightScript.nodes.some(n => n.qualifiedName === 'fn:roArray:Push'));
  });

  test('an edge is categorized by its source node, not its target', () => {
    const raw = makeRaw({
      nodes: [
        { id: 'ro:roArray', label: 'roArray', type: 'Node' },
        { id: 'if:ifArray', label: 'ifArray', type: 'interface' },
      ],
      links: [{ source: 'ro:roArray', target: 'if:ifArray', relation: 'implements' }],
    });
    const { nodes, edges } = toGraphRecords(raw);
    const { brightScript } = partitionRecords(nodes, edges);
    assert.equal(brightScript.edges.length, 1);
  });

  test('produces zero cross-contamination between the two categories', () => {
    const raw = makeRaw({
      nodes: [
        { id: 'sg:Label', label: 'Label', type: 'roSGNode' },
        { id: 'ro:roArray', label: 'roArray', type: 'Node' },
      ],
      links: [],
    });
    const { nodes } = toGraphRecords(raw);
    const { sceneGraph, brightScript } = partitionRecords(nodes, []);
    const sceneGraphKinds = new Set(sceneGraph.nodes.map(n => n.kind));
    const brightScriptKinds = new Set(brightScript.nodes.map(n => n.kind));
    assert.equal(sceneGraphKinds.has('Node'), false);
    assert.equal(brightScriptKinds.has('roSGNode'), false);
  });
});
