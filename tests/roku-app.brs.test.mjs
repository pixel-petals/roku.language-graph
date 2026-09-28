import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractBrsFile } from '../src/parse/roku-app/roku-app.brs.mjs';
import { parseSnippet } from './helpers/parse-snippet.mjs';

describe('roku-app.brs: m.top.createChild/appendChild self-node resolution', () => {
  it('emits a CONTAINS edge from the owning Component to a synthesized child when componentQname is known', () => {
    const { program, file } = parseSnippet('function make()\n  child = m.top.createChild("Label")\nend function\n', 'source/Widget.brs');

    const { nodes, edges } = extractBrsFile(file, program, undefined, 'components/Widget.xml::Widget');

    const contains = edges.find(e => e.kind === 'CONTAINS' && e.sourceQualified === 'components/Widget.xml::Widget');
    assert.ok(contains, 'expected a CONTAINS edge from the component to the dynamic child');
    const child = nodes.find(n => n.qualifiedName === contains.targetQualified);
    assert.equal(child.kind, 'SGNodeInstance');
    assert.equal(child.extra.nodeType, 'Label');
  });

  it('emits a USES_TYPE edge for the literal type argument', () => {
    const { program, file } = parseSnippet('function make()\n  child = m.top.createChild("Label")\nend function\n', 'source/Widget.brs');

    const { edges } = extractBrsFile(file, program, undefined, 'components/Widget.xml::Widget');

    const usesType = edges.find(e => e.kind === 'USES_TYPE');
    assert.ok(usesType, 'expected a USES_TYPE edge for the Label child');
    assert.equal(usesType.targetQualified, 'sg:Label');
  });

  it('falls back to a generic unresolved CALLS edge when no componentQname is known', () => {
    const { program, file } = parseSnippet('function make()\n  child = m.top.createChild("Label")\nend function\n', 'source/Widget.brs');

    const { nodes, edges } = extractBrsFile(file, program);

    assert.equal(nodes.some(n => n.kind === 'SGNodeInstance'), false);
    const call = edges.find(e => e.kind === 'CALLS');
    assert.equal(call.confidenceTier, 'TEXTUAL');
  });

  it('does not special-case createChild called on a non-self receiver', () => {
    const { program, file } = parseSnippet('function make(other)\n  other.createChild("Label")\nend function\n', 'source/Widget.brs');

    const { edges } = extractBrsFile(file, program, undefined, 'components/Widget.xml::Widget');

    assert.equal(edges.some(e => e.kind === 'CONTAINS' && e.sourceQualified === 'components/Widget.xml::Widget'), false);
    assert.ok(edges.some(e => e.kind === 'CALLS'));
  });
});
