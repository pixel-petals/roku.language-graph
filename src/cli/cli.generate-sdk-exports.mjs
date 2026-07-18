/**
 * Parses the Roku SDK docs and the bsbench benchmark catalog, splits both
 * into SceneGraph vs BrightScript — the same distinction Roku developers
 * already use to think about the platform (roSGNode types and their
 * fields, vs core ro-prefixed/if-prefixed language objects, operators, control flow) —
 * and stores each half in its own embedded reference database.
 *
 * Two databases, not one: kept fully separate from any app's own database
 * (see cli.analyze-app.mjs) so reference data never pollutes an
 * individual app's graph/communities, and separate from each other so a
 * SceneGraph-focused query never has to filter out BrightScript-language
 * noise or vice versa. Same schema in both (nodes/edges/metadata,
 * unchanged) — just two files.
 *
 * Usage: node src/cli/cli.generate-sdk-exports.mjs [<sdk-docs-path>]
 *
 * Outputs (per category):
 *   exports/<category>/.graphify-state/graph.pgdata - embedded PGlite reference database (SDK graph + BenchmarkOp nodes)
 *   exports/<category>/wiki/                         - Markdown wiki pages (SDK graph only — benchmark ops excluded from clustering)
 *   exports/<category>/studio/                       - Self-contained HTML studio (open index.html in browser)
 */

import { buildStaticStudio } from '@sentropic/graphify';
import { buildRokuSdkGraph, toGraphRecords, partitionRecords } from '../parse/roku-sdk/roku-sdk.graph.js';
import { partitionCatalog } from '../parse/roku-benchmark/roku-benchmark.classify.mjs';
import { openGraphStore } from '../db/db.store.mjs';
import { toGraphologyGraph, detectCommunities, assignCommunities } from '../db/db.graph.mjs';
import { loadCostModel, benchmarkOpNodes } from '../db/db.benchmark.mjs';
import { toJson } from '../transform/json/json.transform.mjs';
import { toWiki } from '../transform/md/md.transform.mjs';
import fs from 'fs';
import path from 'path';

const sdkDocsPath = process.argv[2] || '/tmp/roku-sdk-docs';
const exportsDir = path.resolve('exports');

/** Store, cluster, and export one category's slice of the reference graph. */
async function buildReferenceExport(label, { nodes, edges }, benchmarkRows) {
  console.log(`\n=== ${label} ===`);
  const categoryDir = path.join(exportsDir, label.toLowerCase());
  const stateDir = path.join(categoryDir, '.graphify-state');
  const wikiDir = path.join(categoryDir, 'wiki');
  const studioDir = path.join(categoryDir, 'studio');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(wikiDir, { recursive: true });
  fs.mkdirSync(studioDir, { recursive: true });

  console.log('Storing graph in database...');
  const dbPath = path.join(stateDir, 'graph.pgdata');
  const store = await openGraphStore(dbPath);
  await store.upsertNodes([...nodes, ...benchmarkOpNodes({ rows: benchmarkRows })]);
  await store.upsertEdges(edges);
  await store.flush();
  console.log(`  → ${dbPath}`);

  console.log('Reading graph back from database...');
  const { nodes: storedNodes, edges: storedEdges } = await store.queryAll();
  await store.close();

  // BenchmarkOp nodes have no edges of their own (until an app's CALLS edge
  // references one) — excluded here so they don't show up as isolated
  // singleton communities in this category's own clustering/wiki output.
  // They're still in the database, just not in this graph view.
  const sdkNodes = storedNodes.filter(n => n.kind !== 'BenchmarkOp');
  const G = toGraphologyGraph(sdkNodes, storedEdges);
  console.log(`  nodes: ${G.order}  edges: ${G.size}  (+ ${storedNodes.length - sdkNodes.length} benchmark ops stored, excluded from clustering)`);

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

  return { dbPath, wikiDir, studioDir };
}

console.log('Parsing Roku SDK docs...');
const raw = buildRokuSdkGraph(sdkDocsPath);
const { nodes: parsedNodes, edges: parsedEdges } = toGraphRecords(raw);
const { sceneGraph: sceneGraphRecords, brightScript: brightScriptRecords } = partitionRecords(parsedNodes, parsedEdges);

console.log('Loading benchmark catalog...');
const costModel = loadCostModel();
const measuredCount = costModel.rows.filter(r => r.microsecondsPerOp != null).length;
console.log(`  ${costModel.rows.length} known operations (${measuredCount} measured)`);
const { sceneGraph: sceneGraphOps, brightScript: brightScriptOps } = partitionCatalog(costModel.rows);

const sceneGraphResult = await buildReferenceExport('SceneGraph', sceneGraphRecords, sceneGraphOps);
const brightScriptResult = await buildReferenceExport('BrightScript', brightScriptRecords, brightScriptOps);

console.log('\n✅ Done.');
console.log('');
console.log('  SceneGraph:');
console.log(`    Database: ${sceneGraphResult.dbPath}`);
console.log(`    Wiki:     ${sceneGraphResult.wikiDir}`);
console.log(`    Studio:   ${sceneGraphResult.studioDir}/index.html`);
console.log('  BrightScript:');
console.log(`    Database: ${brightScriptResult.dbPath}`);
console.log(`    Wiki:     ${brightScriptResult.wikiDir}`);
console.log(`    Studio:   ${brightScriptResult.studioDir}/index.html`);
