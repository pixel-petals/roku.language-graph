/**
 * analyze-app.mjs — Analyze a Roku app with Graphify
 *
 * Parses all .brs and .xml files in a Roku app directory, stores the
 * resulting graph in an embedded database, reads it back out, then runs
 * community detection and exports wiki pages + a static HTML studio from it.
 *
 * Usage:
 *   node src/cli/cli.analyze-app.mjs <app-dir> [output-dir]
 *
 * Outputs (default to <app-dir>/graphify-output/):
 *   .graphify-state/graph.pgdata — embedded PGlite graph database
 *   graph.json                 — raw graph data
 *   wiki/                      — Markdown wiki pages (one per community)
 *   studio/                    — Static HTML studio (open index.html in a browser)
 */

import fs from 'fs';
import path from 'path';
import { parseRokuApp } from '../parse/roku-app/roku-app.parser.mjs';
import { openGraphStore } from '../db/db.store.mjs';
import { toGraphologyGraph, detectCommunities, assignCommunities } from '../db/db.graph.mjs';
import { loadCostModel } from '../db/db.benchmark.mjs';
import { toJson } from '../transform/json/json.transform.mjs';
import { toWiki } from '../transform/md/md.transform.mjs';
import { buildStaticStudio } from '@sentropic/graphify';

// ── Args ──────────────────────────────────────────────────────────────────────

const appDir = process.argv[2];
if (!appDir) {
  console.error('Usage: node src/cli/cli.analyze-app.mjs <app-dir> [output-dir]');
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

console.log('Loading benchmark cost model...');
// Read-only here — only used to bake cost estimates into this app's own
// CALLS edges (extra.estimatedMicroseconds). Raw BenchmarkOp rows live
// only in the reference database (cli.generate-sdk-exports.mjs), kept
// fully separate so they never pollute this app's own graph/communities.
const costModel = loadCostModel();
const measuredCount = costModel.rows.filter(r => r.microsecondsPerOp != null).length;
console.log(`  ${costModel.rows.length} known operations (${measuredCount} measured)`);

console.log('Parsing app...');
const parsed = parseRokuApp(resolvedApp, { costModel });

console.log('Storing graph in database...');
const dbPath = path.join(stateDir, 'graph.pgdata');
const store = await openGraphStore(dbPath);
await store.upsertNodes(parsed.nodes);
await store.upsertEdges(parsed.edges);
await store.flush();
console.log(`  → ${dbPath}`);

console.log('Reading graph back from database...');
const { nodes, edges } = await store.queryAll();
await store.close();
console.log(`  nodes: ${nodes.length}  edges: ${edges.length}`);
console.log('');

const G = toGraphologyGraph(nodes, edges);

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
const communities = detectCommunities(G);
assignCommunities(G, communities);
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
console.log(`  Database: ${dbPath}`);
console.log(`  Studio:   ${studioDir}/index.html`);
console.log(`  Wiki:     ${wikiDir}/`);
console.log(`  Graph:    ${graphJsonPath}`);
