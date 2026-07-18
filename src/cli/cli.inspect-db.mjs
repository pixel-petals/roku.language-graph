/**
 * cli.inspect-db.mjs — Browse a graphify PGlite database from the terminal.
 *
 * No GUI/socket dependency: reuses the project's own already-installed
 * pglite (0.2.17) and `console.table` (stdlib) rather than a real
 * Postgres-wire-protocol connection. A true GUI (VSCode Postgres/Database
 * Client extension) needs `@electric-sql/pglite-socket`, which requires
 * pglite >=0.4.0 — a real, deliberate version bump this project hasn't
 * made (verified: pglite 0.5.4 fails outright to open a .pgdata directory
 * this project's pinned 0.2.17 created). See README's "Inspecting a
 * database" section for that path once/if it's worth taking.
 *
 * Usage:
 *   node src/cli/cli.inspect-db.mjs <path-to-graph.pgdata> [--kind KIND] [--edges] [--limit N] [--kinds]
 *
 * --kinds prints just the valid --kind values for this database (they vary
 * per database — the app db's node kinds differ from the SDK reference
 * dbs') and exits, skipping the row sample.
 */

import path from 'path';
import { openGraphStore } from '../database/database.store.mjs';

/** file.brs::Foo::bar -> Foo::bar (drops the absolute-path prefix shared with its own filePath, for terminal-width readability). */
function shortQualifiedName(qualifiedName, filePath) {
  return qualifiedName.startsWith(`${filePath}::`) ? qualifiedName.slice(filePath.length + 2) : qualifiedName;
}

function parseArgs(argv) {
  const args = { dbPath: undefined, kind: undefined, edges: false, limit: 20, kindsOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--kind') args.kind = argv[++i];
    else if (flag === '--edges') args.edges = true;
    else if (flag === '--limit') args.limit = Number(argv[++i]);
    else if (flag === '--kinds') args.kindsOnly = true;
    else if (!args.dbPath) args.dbPath = flag;
  }
  return args;
}

const { dbPath, kind, edges: showEdges, limit, kindsOnly } = parseArgs(process.argv.slice(2));
if (!dbPath) {
  console.error('Usage: node src/cli/cli.inspect-db.mjs <path-to-graph.pgdata> [--kind KIND] [--edges] [--limit N] [--kinds]');
  process.exit(1);
}

const store = await openGraphStore(dbPath);
const { nodes, edges } = await store.queryAll();
await store.close();

function countBy(rows, key) {
  const counts = {};
  for (const r of rows) counts[r[key]] = (counts[r[key]] ?? 0) + 1;
  return counts;
}

console.log(`\n${dbPath}`);
console.log(`  nodes: ${nodes.length}  edges: ${edges.length}\n`);

console.log('Nodes by kind:');
console.table(countBy(nodes, 'kind'));
console.log('Edges by kind:');
console.table(countBy(edges, 'kind'));

if (kindsOnly) {
  // already printed above — --kinds just stops here instead of also showing a row sample
} else if (showEdges) {
  const rows = (kind ? edges.filter(e => e.kind === kind) : edges).slice(0, limit);
  console.log(`\nEdges${kind ? ` (kind=${kind})` : ''} — showing ${rows.length} of ${edges.length}:`);
  console.table(rows.map(e => ({
    kind: e.kind, source: shortQualifiedName(e.sourceQualified, e.filePath), target: shortQualifiedName(e.targetQualified, e.filePath),
    confidence: e.confidence, tier: e.confidenceTier,
  })));
} else {
  const rows = (kind ? nodes.filter(n => n.kind === kind) : nodes).slice(0, limit);
  console.log(`\nNodes${kind ? ` (kind=${kind})` : ''} — showing ${rows.length} of ${nodes.length}:`);
  console.table(rows.map(n => ({
    kind: n.kind, name: n.name, qualifiedName: shortQualifiedName(n.qualifiedName, n.filePath),
    file: path.basename(n.filePath), line: n.lineStart,
    extra: JSON.stringify(n.extra).slice(0, 60),
  })));
}
