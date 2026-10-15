#!/usr/bin/env node
/**
 * cli.analyze-file.mjs — Analyze one or more standalone .brs/.bs files.
 *
 * Usage: node src/cli/cli.analyze-file.mjs [--summary] <file.brs> [...]
 *
 * Each file is parsed in its own single-file brighterscript Program (no
 * cross-file resolution), so CALLS/EXTENDS targets outside the file stay
 * TEXTUAL rather than RESOLVED. For whole-app resolution use cli.analyze-app.mjs.
 */

import fs from 'fs';
import path from 'path';
import { Program } from 'brighterscript';
import { extractBrsFile } from '../parse/roku-app/roku-app.brs.mjs';

const args = process.argv.slice(2);
const summary = args.includes('--summary');
const files = args.filter(a => a !== '--summary');

if (files.length === 0) {
  console.error('Usage: node src/cli/cli.analyze-file.mjs [--summary] <file.brs> [...]');
  process.exit(1);
}

function analyzeFile(filePath) {
  const resolved = path.resolve(filePath);
  const program = new Program({ rootDir: path.dirname(resolved) });
  program.setFile(path.basename(resolved), fs.readFileSync(resolved, 'utf-8'));
  program.validate();
  const file = program.getFile(path.basename(resolved));
  const result = extractBrsFile(file, program);
  program.dispose?.();
  return result;
}

for (const file of files) {
  const { nodes, edges } = analyzeFile(file);
  if (summary) {
    console.log(`\n=== ${path.basename(file)} ===`);
    for (const n of nodes) console.log(`  ${n.kind.padEnd(10)} ${n.name}`);
    console.log(`\nEdges: ${edges.length}`);
    for (const e of edges) console.log(`  ${e.kind} ${e.sourceQualified} -> ${e.targetQualified}`);
  } else {
    console.log(JSON.stringify({ nodes, edges }, null, 2));
  }
}
