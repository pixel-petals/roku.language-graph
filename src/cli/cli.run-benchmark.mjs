/**
 * cli.run-benchmark.mjs — Run bsbench against a real Roku device and
 * update the checked-in benchmark catalog with real measurements.
 *
 * Usage:
 *   node src/cli/cli.run-benchmark.mjs [--host 192.168.18.17] [--password 1234] [--only PATTERN] [--quiescence-ms 8000]
 *
 * A device is only needed to refresh the numbers — the catalog
 * (src/parse/roku-benchmark/roku-benchmark.catalog.json) already documents
 * every benchmark and carries whatever was last measured (or nothing, if
 * this has never been run). Requires `npm install` inside
 * modules/roku-benchmark first (see roku-benchmark.runner.mjs).
 */

import { runAndUpdateCatalog } from '../parse/roku-benchmark/roku-benchmark.store.mjs';

function parseArgs(argv) {
  const args = { host: '192.168.18.17', password: '1234', only: undefined, quiescenceMs: 8000 };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--host') args.host = argv[++i];
    else if (flag === '--password') args.password = argv[++i];
    else if (flag === '--only') args.only = argv[++i];
    else if (flag === '--quiescence-ms') args.quiescenceMs = Number(argv[++i]);
  }
  return args;
}

const { host, password, only, quiescenceMs } = parseArgs(process.argv.slice(2));

console.log(`Running bsbench against ${host}${only ? ` (--only ${only})` : ''}...`);
console.log(`(waiting for ${quiescenceMs}ms of output silence to detect completion)`);
console.log('');

const { results, updatedCount, archiveDir, catalogPath } = await runAndUpdateCatalog({ host, password, only, quiescenceMs });

console.log('suite'.padEnd(30) + 'test'.padEnd(30) + 'µs/op');
for (const r of results) {
  console.log(r.suiteName.padEnd(30) + r.testName.padEnd(30) + r.microsecondsPerOp.toFixed(2));
}
console.log('');
console.log(`✅ Updated ${updatedCount} catalog row(s).`);
console.log(`  Catalog: ${catalogPath}`);
console.log(`  Raw capture: ${archiveDir}`);
