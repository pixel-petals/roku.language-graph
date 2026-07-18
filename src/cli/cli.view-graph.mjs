/**
 * cli.view-graph.mjs — Render a graphify PGlite database to a self-contained
 * HTML graph viewer (see src/db-graph).
 *
 * Requires `npm run build:db-graph` to have been run first (that build is
 * data-independent — a reusable shell, not tied to any one database — so
 * it doesn't need to re-run per invocation). `npm run view-graph` chains
 * the build automatically; this script itself only fails with a clear
 * message if the shell is missing, rather than silently shelling out to
 * Vite, so it stays predictable to run directly/in CI.
 *
 * Usage:
 *   node src/cli/cli.view-graph.mjs <path-to-graph.pgdata> [--out FILE]
 */

import path from 'path';
import { existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { openGraphStore } from '../db/db.store.mjs';
import { renderApp } from '../db-graph/db-graph.ssr.mjs';

const SHELL_PATH = fileURLToPath(new URL('../../.build/db-graph/index.html', import.meta.url));

function parseArgs(argv) {
  const args = { dbPath: undefined, out: undefined };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--out') args.out = argv[++i];
    else if (!args.dbPath) args.dbPath = flag;
  }
  return args;
}

const { dbPath, out } = parseArgs(process.argv.slice(2));
if (!dbPath) {
  console.error('Usage: node src/cli/cli.view-graph.mjs <path-to-graph.pgdata> [--out FILE]');
  process.exit(1);
}
if (!existsSync(SHELL_PATH)) {
  console.error(`${SHELL_PATH} is missing — run "npm run build:db-graph" first (or use "npm run view-graph", which does this automatically).`);
  process.exit(1);
}
const outPath = out ?? path.join(path.dirname(dbPath), 'db-graph.html');

const store = await openGraphStore(dbPath);
const { nodes, edges } = await store.queryAll();
await store.close();

const html = await renderApp({ nodes, edges }, { shellPath: SHELL_PATH, title: path.basename(dbPath) });
await writeFile(outPath, html);

console.log(`Wrote ${outPath} (${nodes.length} nodes, ${edges.length} edges)`);
