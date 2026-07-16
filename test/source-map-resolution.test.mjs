/**
 * Self-check for source-map resolution of function nodes in buildAppGraph.
 * Builds a tiny fake app (one .brs with a .map, one without) and asserts
 * that function nodes carry the original .bs file/line when a map exists,
 * and fall back to the transpiled location when it doesn't.
 */
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildAppGraph } from '../src/app/graph.mjs';

const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graphify-sourcemap-'));

// Mapped file: one function on line 3 of the transpiled .brs, sourced from
// line 1 of original.bs (a single-line map: transpiled line 3 -> source line 1).
fs.writeFileSync(
  path.join(appDir, 'mapped.brs'),
  '\' comment\n\' comment\nsub doThing()\nend sub\n'
);
fs.writeFileSync(
  path.join(appDir, 'mapped.brs.map'),
  JSON.stringify({
    version: 3,
    sources: ['original.bs'],
    names: [],
    // two blank mapping lines, then a mapping at line 3 col 0 -> source line 1 col 0
    mappings: ';;AAAA',
  })
);

// Unmapped file: no .map sidecar, should fall back to its own relPath/line.
fs.writeFileSync(
  path.join(appDir, 'unmapped.brs'),
  'sub otherThing()\nend sub\n'
);

const G = buildAppGraph(appDir);

const mapped = G.getNodeAttributes('fn:mapped.brs:doThing');
assert.strictEqual(mapped.sourceFile, 'original.bs', 'mapped function should resolve to original.bs');
assert.strictEqual(mapped.sourceLine, 1, 'mapped function should resolve to source line 1');

const unmapped = G.getNodeAttributes('fn:unmapped.brs:otherThing');
assert.strictEqual(unmapped.sourceFile, 'unmapped.brs', 'unmapped function should fall back to its own relPath');
assert.strictEqual(unmapped.sourceLine, 1, 'unmapped function should fall back to its own startLine');

fs.rmSync(appDir, { recursive: true, force: true });

console.log('source-map-resolution: all checks passed');
