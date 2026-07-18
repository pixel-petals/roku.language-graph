/**
 * ebnf.report.mjs
 *
 * Renders the { astResult, textResult } shape from ebnf.validate.mjs's
 * validateGrammarAst()/crossValidateEbnfText() into a Markdown report.
 * Split out from ebnf.validate.mjs: checking the grammar and presenting
 * the check results are different concerns with different reasons to
 * change.
 */

export function formatReport(astResult, textResult) {
  const lines = [];
  const ts = new Date().toISOString();

  lines.push(`# EBNF Validation Report`);
  lines.push(`Generated: ${ts}`);
  lines.push('');

  // ── AST-level results ─────────────────────────────────────────────────────
  lines.push(`## Grammar AST (${astResult.name})`);
  lines.push('');
  lines.push(`- Rules defined: ${astResult.ruleCount}`);
  lines.push(`- Errors:   ${astResult.errors.length}`);
  lines.push(`- Warnings: ${astResult.warnings.length}`);
  lines.push('');

  if (astResult.errors.length) {
    lines.push('### Errors');
    for (const e of astResult.errors) lines.push(`- ❌ ${e}`);
    lines.push('');
  }
  if (astResult.warnings.length) {
    lines.push('### Warnings');
    for (const w of astResult.warnings) lines.push(`- ⚠️  ${w}`);
    lines.push('');
  }
  if (!astResult.errors.length && !astResult.warnings.length) {
    lines.push('✅ No issues found in grammar AST.');
    lines.push('');
  }

  // ── Text-level results ────────────────────────────────────────────────────
  lines.push(`## Generated EBNF Text`);
  lines.push('');
  lines.push(`- Syntax rules:     ${textResult.syntaxRuleCount}`);
  lines.push(`- SDK type rules:   ${textResult.sdkRuleCount}`);
  lines.push(`- Total:            ${textResult.totalRules}`);
  lines.push('');

  const hasDups = textResult.duplicates.syntax.length || textResult.duplicates.sdk.length;
  if (hasDups) {
    lines.push('### Duplicate Rule Names');
    for (const d of textResult.duplicates.syntax) lines.push(`- ❌ [syntax] "${d}"`);
    for (const d of textResult.duplicates.sdk)    lines.push(`- ❌ [sdk]    "${d}"`);
    lines.push('');
  }

  // Filter out known terminal keywords and pattern names that aren't non-terminals
  const KNOWN_TERMINALS = new Set([
    'as', 'in', 'to', 'or', 'and', 'not', 'mod', 'for', 'sub',
    'rem', 'each', 'step', 'goto', 'then', 'else', 'true', 'exit',
    'void', 'print', 'while', 'false', 'float', 'return', 'object',
    'double', 'string', 'invalid', 'integer', 'boolean', 'dynamic',
    'function', 'longeinteger',
  ]);
  const realUndefined = textResult.undefinedRefs.filter(r => !KNOWN_TERMINALS.has(r));

  if (realUndefined.length) {
    lines.push('### Potentially Undefined References in Generated Text');
    lines.push('*(may be false positives for keyword terminals)*');
    for (const r of realUndefined.sort()) lines.push(`- ⚠️  "${r}"`);
    lines.push('');
  }

  if (!hasDups && !realUndefined.length) {
    lines.push('✅ No issues found in generated EBNF text.');
    lines.push('');
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalErrors   = astResult.errors.length + textResult.duplicates.syntax.length + textResult.duplicates.sdk.length;
  const totalWarnings = astResult.warnings.length + realUndefined.length;
  lines.push('## Summary');
  lines.push('');
  lines.push(`| | Count |`);
  lines.push(`|---|---|`);
  lines.push(`| Grammar rules (syntax) | ${astResult.ruleCount} |`);
  lines.push(`| EBNF rules (syntax)    | ${textResult.syntaxRuleCount} |`);
  lines.push(`| EBNF rules (SDK types) | ${textResult.sdkRuleCount} |`);
  lines.push(`| Errors   | ${totalErrors} |`);
  lines.push(`| Warnings | ${totalWarnings} |`);
  lines.push('');
  lines.push(totalErrors === 0
    ? '**Result: ✅ PASS**'
    : `**Result: ❌ FAIL (${totalErrors} error${totalErrors === 1 ? '' : 's'})**`);

  return lines.join('\n');
}
