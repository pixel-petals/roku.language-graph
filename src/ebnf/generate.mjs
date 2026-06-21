/**
 * generate.mjs — Entry point
 *
 * Generates EBNF files and a validation report:
 *   exports/brightscript-syntax.ebnf   — BrightScript language grammar
 *   exports/roku-sdk-types.ebnf        — Roku SDK type definitions
 *   exports/brightscript-full.ebnf     — Both combined into one file
 *   exports/ebnf-validation-report.md  — Validation results
 *
 * Exits with code 1 if validation finds errors.
 *
 * Usage: node src/ebnf/generate.mjs [<sdk-docs-path>]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseGrammar }           from './grammar-parser.mjs';
import { grammarToEbnf }          from './ebnf-serializer.mjs';
import { sdkToEbnf }              from './sdk-to-ebnf.mjs';
import {
  validateGrammarAst,
  crossValidateEbnfText,
  formatReport,
} from './validate.mjs';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const sdkDocsPath = process.argv[2] || '/tmp/roku-sdk-docs';
const exportsDir  = path.resolve(__dirname, '../../exports');

fs.mkdirSync(exportsDir, { recursive: true });

// ── 1. Syntax grammar ─────────────────────────────────────────────────────────
console.log('Parsing grammar.js...');
const parsed     = parseGrammar();
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

// ── 4. Validate ───────────────────────────────────────────────────────────────
console.log('\nValidating...');
const astResult  = validateGrammarAst(parsed);
const textResult = crossValidateEbnfText(syntaxEbnf, typesEbnf);

// Print compact summary to console
if (astResult.errors.length) {
  for (const e of astResult.errors)   console.error(`  ❌ ${e}`);
}
if (astResult.warnings.length) {
  for (const w of astResult.warnings) console.warn(`  ⚠  ${w}`);
}
console.log(`  Grammar AST : ${astResult.ruleCount} rules, ${astResult.errors.length} errors, ${astResult.warnings.length} warnings`);
console.log(`  EBNF text   : ${textResult.syntaxRuleCount} syntax + ${textResult.sdkRuleCount} SDK rules`);

// ── 5. Write validation report ────────────────────────────────────────────────
const report     = formatReport(astResult, textResult);
const reportPath = path.join(exportsDir, 'ebnf-validation-report.md');
fs.writeFileSync(reportPath, report);
console.log(`  → ${reportPath}`);

// ── 6. Final status ───────────────────────────────────────────────────────────
const totalErrors = astResult.errors.length
  + textResult.duplicates.syntax.length
  + textResult.duplicates.sdk.length;

console.log('');
if (totalErrors === 0) {
  console.log('✅ Validation passed.');
} else {
  console.error(`❌ Validation failed — ${totalErrors} error(s). See ${reportPath}`);
  process.exit(1);
}
