/**
 * Generates Graphify wiki pages and static HTML studio from the Roku SDK graph.
 *
 * Usage: node src/generate-exports.mjs [<sdk-docs-path>]
 *
 * Outputs:
 *   exports/wiki/       - Markdown wiki pages (one per node + community pages)
 *   exports/studio/     - Self-contained HTML studio (open index.html in browser)
 */

import { createRequire } from 'module';
import { cluster, toWiki, toJson, buildStaticStudio } from '@sentropic/graphify';
import { loadRokuSdkGraph } from './roku-sdk-graph.js';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);

const sdkDocsPath = process.argv[2] || '/tmp/roku-sdk-docs';
const exportsDir = path.resolve('exports');
const stateDir = path.join(exportsDir, '.graphify-state');
const wikiDir = path.join(exportsDir, 'wiki');
const studioDir = path.join(exportsDir, 'studio');

fs.mkdirSync(stateDir, { recursive: true });
fs.mkdirSync(wikiDir, { recursive: true });
fs.mkdirSync(studioDir, { recursive: true });

console.log('Loading Roku SDK graph...');
const G = loadRokuSdkGraph(sdkDocsPath);
console.log(`  nodes: ${G.order}  edges: ${G.size}`);

console.log('Running community detection...');
const communities = cluster(G);
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
console.log(`  Wiki:   exports/wiki/`);
console.log(`  Studio: exports/studio/index.html`);
