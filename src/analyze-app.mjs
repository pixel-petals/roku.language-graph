/**
 * analyze-app.mjs — Analyze a Roku app with Graphify
 *
 * Parses all .brs and .xml files in a Roku app directory, builds a code graph,
 * runs community detection, and exports wiki pages + a static HTML studio.
 *
 * Usage:
 *   node src/analyze-app.mjs <app-dir> [output-dir]
 *
 * Outputs (default to <app-dir>/graphify-output/):
 *   graph.json       — raw graph data
 *   wiki/            — Markdown wiki pages (one per community)
 *   studio/          — Static HTML studio (open index.html in a browser)
 */

import fs from 'fs';
import path from 'path';
import { buildAppGraph } from './app-graph.mjs';
import { cluster, toWiki, toJson, buildStaticStudio } from '@sentropic/graphify';

// ── Args ──────────────────────────────────────────────────────────────────────

const appDir = process.argv[2];
if (!appDir) {
  console.error('Usage: node src/analyze-app.mjs <app-dir> [output-dir]');
  console.error('');
  console.error('  <app-dir>    Path to a Roku app (must contain source/ and components/)');
  console.error('  [output-dir] Where to write outputs (default: <app-dir>/graphify-output)');
  process.exit(1);
}

const resolvedApp = path.resolve(appDir);
if (!fs.existsSync(resolvedApp)) {
  console.error(`❌ App directory not found: ${resolvedApp}`);
  process.exit(1);
}

const outputDir = path.resolve(process.argv[3] || path.join(resolvedApp, 'graphify-output'));
const stateDir  = path.join(outputDir, '.graphify-state');
const wikiDir   = path.join(outputDir, 'wiki');
const studioDir = path.join(outputDir, 'studio');

fs.mkdirSync(stateDir,  { recursive: true });
fs.mkdirSync(wikiDir,   { recursive: true });
fs.mkdirSync(studioDir, { recursive: true });

// ── Run ───────────────────────────────────────────────────────────────────────

console.log(`Analyzing Roku app: ${resolvedApp}`);
console.log('');

console.log('Building code graph...');
const G = buildAppGraph(resolvedApp);

// Count by type
const typeCounts = {};
for (const node of G.nodes()) {
  const t = G.getNodeAttribute(node, 'type') || 'unknown';
  typeCounts[t] = (typeCounts[t] || 0) + 1;
}
console.log(`  Nodes (${G.order} total):`);
for (const [type, count] of Object.entries(typeCounts)) {
  console.log(`    ${type.padEnd(12)} ${count}`);
}
console.log(`  Edges: ${G.size}`);
console.log('');

if (G.order === 0) {
  console.error('❌ No nodes found — is this a valid Roku app directory?');
  process.exit(1);
}

console.log('Running community detection...');
const communities = cluster(G);
console.log(`  ${communities.size} communities detected`);
console.log('');

console.log('Writing graph.json...');
const graphJsonPath = path.join(stateDir, 'graph.json');
toJson(G, communities, graphJsonPath, { force: true });
console.log(`  → ${graphJsonPath}`);

console.log('Generating wiki pages...');
const pageCount = toWiki(G, communities, wikiDir);
console.log(`  → ${wikiDir}  (${pageCount} pages)`);

console.log('Building static HTML studio...');
const studioResult = buildStaticStudio({
  stateDir,
  outDir: studioDir,
  onWarning: (msg) => console.warn('  [warn]', msg),
});
console.log(`  → ${studioDir}/index.html`);
console.log('');

console.log('✅ Done.');
console.log('');
console.log(`  Studio:  ${studioDir}/index.html`);
console.log(`  Wiki:    ${wikiDir}/`);
console.log(`  Graph:   ${graphJsonPath}`);
