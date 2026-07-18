import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openTempStore } from './helpers/temp-store.mjs';

// One shared store for this whole file rather than one per test: PGlite's
// WASM boot + extension load costs ~1.5-2s per instance (measured), which
// multiplied across a dozen fresh-instance tests blew well past this
// project's "low single-digit seconds" full-suite budget. Isolation is kept
// where it actually matters — no test's pass/fail depends on another
// test's data or on execution order — via a unique qualifiedName/filePath
// prefix per test (uniquify()) instead of a unique physical database.
let store;
let cleanup;

before(async () => {
  ({ store, cleanup } = await openTempStore());
});

after(async () => {
  await cleanup();
});

let counter = 0;
function uniquify() {
  return `t${counter++}`;
}

function makeNode(prefix, overrides = {}) {
  return {
    kind: 'Function', name: 'foo', qualifiedName: `${prefix}.brs::foo`, filePath: `${prefix}.brs`,
    lineStart: 1, lineEnd: 3, language: 'brightscript', parentName: null,
    params: '[]', returnType: null, modifiers: ['function'], isTest: false, fileHash: null,
    extra: {},
    ...overrides,
  };
}

function makeEdge(prefix, overrides = {}) {
  return {
    kind: 'CALLS', sourceQualified: `${prefix}.brs::a`, targetQualified: `${prefix}.brs::b`,
    filePath: `${prefix}.brs`, line: 5, extra: {}, confidence: 1.0, confidenceTier: 'DECLARED',
    ...overrides,
  };
}

async function queryNode(qualifiedName) {
  const { nodes } = await store.queryAll();
  return nodes.find(n => n.qualifiedName === qualifiedName);
}

async function queryEdgesForFile(filePath) {
  const { edges } = await store.queryAll();
  return edges.filter(e => e.filePath === filePath);
}

describe('pglite.db: node round-trip', () => {
  test('a stored node round-trips through queryAll with the same shape', async () => {
    const p = uniquify();
    await store.upsertNodes([makeNode(p, { extra: { doc: 'hello' } })]);
    await store.flush();
    const node = await queryNode(`${p}.brs::foo`);

    assert.equal(node.kind, 'Function');
    assert.deepEqual(node.modifiers, ['function']);
    assert.equal(node.isTest, false);
    assert.deepEqual(node.extra, { doc: 'hello' });
  });

  test('re-upserting the same qualifiedName in a later flush() updates in place, not duplicates', async () => {
    const p = uniquify();
    await store.upsertNodes([makeNode(p, { extra: { version: 1 } })]);
    await store.flush();
    await store.upsertNodes([makeNode(p, { extra: { version: 2 } })]);
    await store.flush();

    const { nodes } = await store.queryAll();
    const matching = nodes.filter(n => n.qualifiedName === `${p}.brs::foo`);
    assert.equal(matching.length, 1);
    assert.equal(matching[0].extra.version, 2);
  });

  test('duplicate qualifiedNames within the same batch resolve last-write-wins, not a crash', async () => {
    const p = uniquify();
    await store.upsertNodes([
      makeNode(p, { extra: { which: 'first' } }),
      makeNode(p, { extra: { which: 'second' } }),
    ]);
    await assert.doesNotReject(() => store.flush());

    const { nodes } = await store.queryAll();
    const matching = nodes.filter(n => n.qualifiedName === `${p}.brs::foo`);
    assert.equal(matching.length, 1);
    assert.equal(matching[0].extra.which, 'second');
  });

  test('values containing commas, quotes, and newlines survive the round trip intact', async () => {
    const p = uniquify();
    const tricky = 'has, a comma and "quotes"\nand a newline';
    await store.upsertNodes([makeNode(p, { extra: { jsdoc: tricky } })]);
    await store.flush();
    const node = await queryNode(`${p}.brs::foo`);

    assert.equal(node.extra.jsdoc, tricky);
  });
});

describe('pglite.db: jsdocError preserves the prior jsdoc value', () => {
  test('a jsdocError-flagged node keeps the previously stored jsdoc instead of erasing it', async () => {
    const p = uniquify();
    await store.upsertNodes([makeNode(p, { extra: { jsdoc: '/** original */' } })]);
    await store.flush();
    await store.upsertNodes([makeNode(p, { extra: { jsdocError: true } })]);
    await store.flush();

    const node = await queryNode(`${p}.brs::foo`);
    assert.equal(node.extra.jsdoc, '/** original */');
    assert.equal('jsdocError' in node.extra, false);
  });

  test('a jsdocError-flagged node with no prior row is a no-op, not a crash', async () => {
    const p = uniquify();
    await store.upsertNodes([makeNode(p, { extra: { jsdocError: true } })]);
    await assert.doesNotReject(() => store.flush());

    const node = await queryNode(`${p}.brs::foo`);
    assert.equal('jsdocError' in node.extra, false);
  });

  test('a later successful extraction overwrites a preserved value', async () => {
    const p = uniquify();
    await store.upsertNodes([makeNode(p, { extra: { jsdoc: '/** original */' } })]);
    await store.flush();
    await store.upsertNodes([makeNode(p, { extra: { jsdocError: true } })]);
    await store.flush();
    await store.upsertNodes([makeNode(p, { extra: { jsdoc: '/** updated */' } })]);
    await store.flush();

    const node = await queryNode(`${p}.brs::foo`);
    assert.equal(node.extra.jsdoc, '/** updated */');
  });
});

describe('pglite.db: edge round-trip', () => {
  test('confidence float round-trips exactly through the SMALLINT (0-100) storage format', async () => {
    const p = uniquify();
    await store.upsertEdges([makeEdge(p, { confidence: 0.9 })]);
    await store.flush();
    const edges = await queryEdgesForFile(`${p}.brs`);

    assert.equal(edges[0].confidence, 0.9);
  });

  test('re-flushing edges for the same file replaces the old ones rather than accumulating', async () => {
    const p = uniquify();
    await store.upsertEdges([makeEdge(p, { line: 1 })]);
    await store.flush();
    await store.upsertEdges([makeEdge(p, { line: 2 })]);
    await store.flush();

    const edges = await queryEdgesForFile(`${p}.brs`);
    assert.equal(edges.length, 1);
    assert.equal(edges[0].line, 2);
  });

  test('edges for different files accumulate independently', async () => {
    const p1 = uniquify();
    const p2 = uniquify();
    await store.upsertEdges([makeEdge(p1)]);
    await store.flush();
    await store.upsertEdges([makeEdge(p2)]);
    await store.flush();

    assert.equal((await queryEdgesForFile(`${p1}.brs`)).length, 1);
    assert.equal((await queryEdgesForFile(`${p2}.brs`)).length, 1);
  });
});

describe('pglite.db: empty input', () => {
  test('flush() with no queued nodes/edges is a no-op, not an error', async () => {
    const before = await store.queryAll();
    await assert.doesNotReject(() => store.flush());
    const after = await store.queryAll();
    assert.equal(after.nodes.length, before.nodes.length);
    assert.equal(after.edges.length, before.edges.length);
  });
});
