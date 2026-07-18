import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { umlSectionLayout, umlLabelText, umlNodeSize, umlSectionAtFraction, cappedMemberLines, MAX_MEMBER_LINES } from '../src/db-graph/viewer/viewer.uml-layout.mjs';

const ALL_VISIBLE = { fields: true, publicMethods: true, privateMethods: true };

function makeData(overrides = {}) {
  return {
    kind: 'Component',
    name: 'Widget',
    members: { fields: ['a: string'], publicMethods: ['init()'], privateMethods: [] },
    ...overrides,
  };
}

describe('viewer.uml-layout: cappedMemberLines', () => {
  it('passes a short list through unchanged', () => {
    assert.deepEqual(cappedMemberLines(['a', 'b']), ['a', 'b']);
  });

  it('truncates a long list with a "… and N more" trailer', () => {
    const members = Array.from({ length: MAX_MEMBER_LINES + 3 }, (_, i) => `m${i}`);
    const result = cappedMemberLines(members);
    assert.equal(result.length, MAX_MEMBER_LINES + 1);
    assert.equal(result.at(-1), '… and 3 more');
  });
});

describe('viewer.uml-layout: umlSectionLayout', () => {
  it('omits empty sections entirely', () => {
    const data = makeData();
    const layout = umlSectionLayout(data, ALL_VISIBLE);
    assert.deepEqual(layout.map(s => s.key), ['fields', 'publicMethods']);
  });

  it('an expanded section lists its header plus every member', () => {
    const data = makeData();
    const layout = umlSectionLayout(data, ALL_VISIBLE);
    const fields = layout.find(s => s.key === 'fields');
    assert.deepEqual(fields.lines, ['― Properties (1) ―', 'a: string']);
  });

  it('a folded section collapses to a single header line with a "folded" marker', () => {
    const data = makeData();
    const layout = umlSectionLayout(data, { ...ALL_VISIBLE, fields: false });
    const fields = layout.find(s => s.key === 'fields');
    assert.deepEqual(fields.lines, ['― Properties (1, folded) ―']);
  });
});

describe('viewer.uml-layout: umlLabelText', () => {
  it('starts with the stereotype and name lines', () => {
    const text = umlLabelText(makeData(), ALL_VISIBLE);
    const lines = text.split('\n');
    assert.deepEqual(lines.slice(0, 2), ['«Component»', 'Widget']);
  });

  it('renders sections in Properties/Public Functions/Private Functions order', () => {
    const data = makeData({ members: { fields: ['a'], publicMethods: ['b()'], privateMethods: ['c()'] } });
    const text = umlLabelText(data, ALL_VISIBLE);
    const headerLines = text.split('\n').filter(l => l.startsWith('―'));
    assert.deepEqual(headerLines, ['― Properties (1) ―', '― Public Functions (1) ―', '― Private Functions (1) ―']);
  });
});

describe('viewer.uml-layout: umlNodeSize', () => {
  it('a folded section produces a shorter box than the same section expanded', () => {
    const data = makeData({ members: { fields: Array.from({ length: 5 }, (_, i) => `f${i}`), publicMethods: [], privateMethods: [] } });
    const [, expandedHeight] = umlNodeSize(data, ALL_VISIBLE);
    const [, foldedHeight] = umlNodeSize(data, { ...ALL_VISIBLE, fields: false });
    assert.ok(foldedHeight < expandedHeight);
  });

  it('agrees with umlSectionLayout\'s own line count', () => {
    const data = makeData();
    const visibility = ALL_VISIBLE;
    const totalLines = 2 + umlSectionLayout(data, visibility).reduce((sum, s) => sum + s.lines.length, 0);
    const [, height] = umlNodeSize(data, visibility);
    assert.equal(height, 16 + totalLines * 16);
  });
});

describe('viewer.uml-layout: umlSectionAtFraction', () => {
  // 2 header lines + Properties(header+1=2) + Public Functions(header+1=2) = 6 total lines.
  const data = makeData();

  it('returns null for a fraction landing on the stereotype/name header lines', () => {
    assert.equal(umlSectionAtFraction(data, ALL_VISIBLE, 0), null);
    assert.equal(umlSectionAtFraction(data, ALL_VISIBLE, 0.3), null); // line 1 (floor(0.3*6)=1)
  });

  it('returns the section whose header or member line the fraction lands on', () => {
    // line index 2 = Properties header (floor(0.4*6)=2)
    assert.equal(umlSectionAtFraction(data, ALL_VISIBLE, 0.4), 'fields');
    // line index 3 = Properties member "a: string" (floor(0.55*6)=3)
    assert.equal(umlSectionAtFraction(data, ALL_VISIBLE, 0.55), 'fields');
    // line index 4 = Public Functions header (floor(0.7*6)=4)
    assert.equal(umlSectionAtFraction(data, ALL_VISIBLE, 0.7), 'publicMethods');
  });

  it('returns null for a fraction past the last section', () => {
    assert.equal(umlSectionAtFraction(data, ALL_VISIBLE, 1), null);
  });

  it('a folded section is a single clickable line, same as any other', () => {
    const folded = { ...ALL_VISIBLE, fields: false };
    // Total lines with fields folded: 2 header + 1 (Properties folded) + 2 (Public Functions) = 5.
    // line index 2 = the folded Properties header itself.
    assert.equal(umlSectionAtFraction(data, folded, 0.5), 'fields');
  });
});
