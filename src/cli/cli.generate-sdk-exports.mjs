/**
 * Parses the Roku SDK docs, stores the resulting graph in an embedded
 * database, reads it back out, then generates Graphify wiki pages and a
 * static HTML studio from it.
 *
 * Usage: node src/cli/cli.generate-sdk-exports.mjs [<sdk-docs-path>]
 *
 * Outputs:
 *   exports/.graphify-state/graph.pgdata - embedded PGlite graph database
 *   exports/wiki/                     - Markdown wiki pages (one per node + community pages)
 *   exports/studio/                   - Self-contained HTML studio (open index.html in browser)
 */

import { buildStaticStudio } from '@sentropic/graphify';
import { buildRokuSdkGraph, toGraphRecords } from '../parse/roku-sdk/roku-sdk.graph.js';
import { openGraphStore } from '../database/database.store.mjs';
import { toGraphologyGraph, detectCommunities, assignCommunities } from '../database/database.graph.mjs';
import { toJson } from '../transform/json/json.transform.mjs';
import { toWiki } from '../transform/md/md.transform.mjs';
import fs from 'fs';
import path from 'path';

const sdkDocsPath = process.argv[2] || '/tmp/roku-sdk-docs';
const exportsDir = path.resolve('exports');
const stateDir = path.join(exportsDir, '.graphify-state');
const wikiDir = path.join(exportsDir, 'wiki');
const studioDir = path.join(exportsDir, 'studio');

fs.mkdirSync(stateDir, { recursive: true });
fs.mkdirSync(wikiDir, { recursive: true });
fs.mkdirSync(studioDir, { recursive: true });

console.log('Parsing Roku SDK docs...');
const raw = buildRokuSdkGraph(sdkDocsPath);
const { nodes: parsedNodes, edges: parsedEdges } = toGraphRecords(raw);

console.log('Storing graph in database...');
const dbPath = path.join(stateDir, 'graph.pgdata');
const store = await openGraphStore(dbPath);
await store.upsertNodes(parsedNodes);
await store.upsertEdges(parsedEdges);
await store.flush();
console.log(`  → ${dbPath}`);

console.log('Reading graph back from database...');
const { nodes, edges } = await store.queryAll();
await store.close();

const G = toGraphologyGraph(nodes, edges);
console.log(`  nodes: ${G.order}  edges: ${G.size}`);

console.log('Running community detection...');
const communities = detectCommunities(G);
assignCommunities(G, communities);
console.log(`  communities: ${communities.size}`);

console.log('Writing graph.json...');
const graphJsonPath = path.join(stateDir, 'graph.json');
toJson(G, communities, graphJsonPath);
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
console.log(`  → ${studioDir}`);
console.log(`  nodes: ${studioResult.nodeCount}  scene nodes: ${studioResult.sceneNodeCount}  scene edges: ${studioResult.sceneEdgeCount}`);

console.log('\nDone.');
console.log(`  Database: ${dbPath}`);
console.log(`  Wiki:     exports/wiki/`);
console.log(`  Studio:   exports/studio/index.html`);
