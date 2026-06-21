/**
 * generate.mjs — Entry point
 *
 * Generates two EBNF files:
 *   exports/brightscript-syntax.ebnf   — BrightScript language grammar
 *   exports/roku-sdk-types.ebnf        — Roku SDK type definitions
 *   exports/brightscript-full.ebnf     — Both combined into one file
 *
 * Usage: node src/ebnf/generate.mjs [<sdk-docs-path>]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseGrammar }  from './grammar-parser.mjs';
import { grammarToEbnf } from './ebnf-serializer.mjs';
import { sdkToEbnf }     from './sdk-to-ebnf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sdkDocsPath = process.argv[2] || '/tmp/roku-sdk-docs';
const exportsDir  = path.resolve(__dirname, '../../exports');

fs.mkdirSync(exportsDir, { recursive: true });

// ── 1. Syntax grammar ─────────────────────────────────────────────────────────
console.log('Parsing grammar.js...');
const parsed  = parseGrammar();
const syntaxEbnf = grammarToEbnf(parsed);
const syntaxPath = path.join(exportsDir, 'brightscript-syntax.ebnf');
fs.writeFileSync(syntaxPath, syntaxEbnf);
console.log(`  → ${syntaxPath}  (${syntaxEbnf.split('\n').length} lines)`);

// ── 2. SDK type grammar ───────────────────────────────────────────────────────
console.log('Building SDK type EBNF...');
const typesEbnf = sdkToEbnf(sdkDocsPath);
const typesPath = path.join(exportsDir, 'roku-sdk-types.ebnf');
fs.writeFileSync(typesPath, typesEbnf);
console.log(`  → ${typesPath}  (${typesEbnf.split('\n').length} lines)`);

// ── 3. Combined file ──────────────────────────────────────────────────────────
const fullEbnf = [
  syntaxEbnf,
  '',
  '(* ' + '═'.repeat(67) + ' *)',
  '',
  typesEbnf,
].join('\n');
const fullPath = path.join(exportsDir, 'brightscript-full.ebnf');
fs.writeFileSync(fullPath, fullEbnf);
console.log(`  → ${fullPath}  (${fullEbnf.split('\n').length} lines)`);

console.log('\nDone.');
