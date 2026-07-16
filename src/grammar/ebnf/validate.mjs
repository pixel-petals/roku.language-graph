/**
 * validate.mjs
 *
 * Validates the parsed grammar AST for:
 *   - Undefined rule references (a rule is used but never defined)
 *   - Duplicate rule definitions
 *   - Unreachable rules (not reachable from source_file)
 *   - Empty rules (body is a bare empty-string terminal)
 *
 * Also validates the generated EBNF text files for:
 *   - Parseable rule definitions (every line with ::= can be read back)
 *   - Duplicate rule names across files
 *
 * Returns a ValidationReport object.
 */

// ── AST walker ────────────────────────────────────────────────────────────────

function collectRefs(node, refs = new Set()) {
  if (!node || typeof node !== 'object') return refs;
  if (node.type === 'rule') {
    refs.add(node.name);
    return refs;
  }
  for (const key of ['item', 'items']) {
    if (!node[key]) continue;
    const children = Array.isArray(node[key]) ? node[key] : [node[key]];
    for (const child of children) collectRefs(child, refs);
  }
  return refs;
}

function isEmptyNode(node) {
  return node && node.type === 'terminal' && !node.value;
}

// ── Reachability (BFS from start rule) ───────────────────────────────────────

function reachableFrom(startRule, rules) {
  const visited = new Set();
  const queue = [startRule];
  while (queue.length) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    if (rules[current]) {
      for (const ref of collectRefs(rules[current])) {
        if (!visited.has(ref)) queue.push(ref);
      }
    }
  }
  return visited;
}

// ── AST validation ────────────────────────────────────────────────────────────

export function validateGrammarAst(parsed) {
  const { name, rules } = parsed;
  const errors   = [];
  const warnings = [];

  const defined = new Set(Object.keys(rules));

  // Duplicate names are impossible in a JS object, but check anyway
  const seen = new Set();
  for (const ruleName of defined) {
    if (seen.has(ruleName)) errors.push(`Duplicate rule definition: "${ruleName}"`);
    seen.add(ruleName);
  }

  // Collect all rule references
  const allRefs = new Set();
  for (const [ruleName, node] of Object.entries(rules)) {
    for (const ref of collectRefs(node)) {
      allRefs.add(ref);
    }
  }

  // Undefined references — skip leading-underscore internal rules that
  // tree-sitter strips from the public grammar but are referenced internally
  for (const ref of allRefs) {
    if (!defined.has(ref) && !defined.has(`_${ref}`)) {
      errors.push(`Undefined rule reference: "${ref}"`);
    }
  }

  // Empty rules
  for (const [ruleName, node] of Object.entries(rules)) {
    if (isEmptyNode(node)) {
      warnings.push(`Rule "${ruleName}" has an empty body`);
    }
  }

  // Unreachable rules (from source_file).
  // tree-sitter's `extras` list (whitespace, comment) is intentionally absent
  // from the reachability graph — they are injected by the scanner, not the
  // grammar rules — so we exclude them from the unreachable warning.
  const EXTRAS_RULES = new Set(['comment']);
  if (rules['source_file']) {
    const reachable = reachableFrom('source_file', rules);
    for (const ruleName of defined) {
      if (EXTRAS_RULES.has(ruleName)) continue;
      const canonical = ruleName.startsWith('_') ? ruleName.slice(1) : ruleName;
      if (!reachable.has(ruleName) && !reachable.has(canonical)) {
        warnings.push(`Unreachable rule: "${ruleName}"`);
      }
    }
  }

  return { name, errors, warnings, ruleCount: defined.size };
}

// ── Text-level EBNF validation ────────────────────────────────────────────────

/**
 * Parse EBNF text, extract all rule names (LHS of ::=), and check for
 * duplicates. Returns { defined: Set<string>, duplicates: string[] }.
 */
export function parseEbnfDefinitions(ebnfText) {
  const defined    = new Set();
  const duplicates = [];
  for (const line of ebnfText.split('\n')) {
    const m = line.match(/^(\S+)\s+::=/);
    if (!m) continue;
    const ruleName = m[1];
    if (defined.has(ruleName)) duplicates.push(ruleName);
    else defined.add(ruleName);
  }
  return { defined, duplicates };
}

/**
 * Cross-validate that all non-terminal references in the EBNF text resolve
 * to a defined rule (in the combined set of syntax + SDK definitions).
 *
 * Only bare lowercase_with_underscores tokens that appear OUTSIDE of quoted
 * strings are treated as non-terminal references. This prevents parameter
 * names inside method signature strings ("Push(value As Dynamic) As Void")
 * from being mistaken for missing rule references.
 */
export function crossValidateEbnfText(syntaxText, sdkText) {
  const { defined: syntaxDefs, duplicates: syntaxDups } = parseEbnfDefinitions(syntaxText);
  const { defined: sdkDefs,    duplicates: sdkDups    } = parseEbnfDefinitions(sdkText);
  const allDefined = new Set([...syntaxDefs, ...sdkDefs]);

  // Strip quoted strings from a line before scanning for bare rule references.
  // This prevents token extraction from inside "Push(value As Dynamic) As Void".
  function stripQuoted(s) {
    return s.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  }

  // A non-terminal reference: lowercase word containing at least one underscore
  // (our rule names all use snake_case), so simple lowercase words like "as",
  // "in", "or" that appear as keyword terminals are excluded automatically.
  const refPattern = /\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g;
  const allRefs = new Set();

  for (const text of [syntaxText, sdkText]) {
    for (const line of text.split('\n')) {
      if (line.trim().startsWith('(*')) continue;
      // Pull RHS from lines that define or continue a rule
      const rhsStart = line.indexOf('::=');
      const rhs = rhsStart >= 0
        ? stripQuoted(line.slice(rhsStart + 3))
        : stripQuoted(line);          // continuation lines (| ...)
      for (const m of rhs.matchAll(refPattern)) allRefs.add(m[1]);
    }
  }

  const undefinedRefs = [...allRefs].filter(r => !allDefined.has(r));

  return {
    syntaxRuleCount: syntaxDefs.size,
    sdkRuleCount:    sdkDefs.size,
    totalRules:      allDefined.size,
    undefinedRefs,
    duplicates: { syntax: syntaxDups, sdk: sdkDups },
  };
}

// ── Report formatter ──────────────────────────────────────────────────────────

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
