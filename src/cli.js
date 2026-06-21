#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { analyze } = require('./index');

const args = process.argv.slice(2);
const formatFlag = args.indexOf('--format');
const format = formatFlag !== -1 ? args[formatFlag + 1] : 'dot';
const files = args.filter((a, i) => !a.startsWith('--') && i !== formatFlag + 1);

if (files.length === 0) {
  console.error('Usage: roku-graphify [--format dot|json|summary] <file.brs> [...]');
  process.exit(1);
}

for (const file of files) {
  const code = fs.readFileSync(path.resolve(file), 'utf-8');
  const result = analyze(code);

  if (format === 'json') {
    console.log(JSON.stringify(result.graph.toJSON(), null, 2));
  } else if (format === 'summary') {
    const { functions, calls } = result.graph.toJSON();
    console.log(`\n=== ${path.basename(file)} ===`);
    console.log(`Functions/Subs: ${functions.length}`);
    functions.forEach(f => console.log(`  ${f.kind.padEnd(8)} ${f.name} (lines ${f.startLine}-${f.endLine})`));
    console.log(`\nCall edges: ${calls.length}`);
    calls.forEach(c => console.log(`  ${c.from} -> ${c.to} (x${c.weight})`));
  } else {
    // Default: DOT format
    console.log(result.graph.toDot());
  }
}
