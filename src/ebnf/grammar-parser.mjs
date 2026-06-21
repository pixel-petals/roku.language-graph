/**
 * grammar-parser.mjs
 *
 * Evaluates the tree-sitter grammar.js in a sandboxed vm context where every
 * DSL function (seq, choice, optional, …) returns a plain AST node instead of
 * calling tree-sitter. The `$` proxy converts `$.foo` into a rule-reference
 * node. The result is a `{ name, rules }` object ready for serialization.
 */

import vm from 'vm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GRAMMAR_PATH = path.resolve(__dirname, '../../tree-sitter-brightscript/grammar.js');

// ── AST node constructors ─────────────────────────────────────────────────────

const n = {
  seq:      (...items)    => ({ type: 'seq',      items: items.flat() }),
  choice:   (...items)    => ({ type: 'choice',   items: items.flat() }),
  optional: (item)        => ({ type: 'optional', item }),
  repeat:   (item)        => ({ type: 'repeat',   item }),
  repeat1:  (item)        => ({ type: 'repeat1',  item }),
  token:    (item)        => ({ type: 'token',    item }),
  rule:     (name)        => ({ type: 'rule',     name }),
  terminal: (value)       => ({ type: 'terminal', value }),
  regex:    (source)      => ({ type: 'regex',    source }),
};

// ── DSL mock ─────────────────────────────────────────────────────────────────

function makePrec() {
  // tree-sitter prec can be called as prec(rule) OR prec(priority, rule)
  const strip = (...args) => args.length === 1 ? args[0] : args[1];
  const fn = strip;
  fn.left  = strip;
  fn.right = strip;
  return fn;
}

const dsl = {
  seq:     (...args) => n.seq(...args.map(coerce)),
  choice:  (...args) => n.choice(...args.map(coerce)),
  optional:(item)    => n.optional(coerce(item)),
  repeat:  (item)    => n.repeat(coerce(item)),
  repeat1: (item)    => n.repeat1(coerce(item)),
  token:   (item)    => n.token(coerce(item)),
  field:   (_name, item) => coerce(item),                 // strip field labels
  alias:   (item, aliasTo) => (
    aliasTo && typeof aliasTo === 'object' && aliasTo.name
      ? n.rule(aliasTo.name)
      : coerce(item)
  ),
  prec: makePrec(),
};

function coerce(v) {
  if (v === null || v === undefined) return n.terminal('');
  if (typeof v === 'string')  return n.terminal(v);
  // Use duck-typing instead of instanceof so vm-realm regexes are handled correctly
  if (typeof v === 'object' && typeof v.source === 'string' && typeof v.flags === 'string') {
    return n.regex(v.source);
  }
  if (typeof v === 'object' && v.type) return v;
  return n.terminal(String(v));
}

// ── $ proxy ───────────────────────────────────────────────────────────────────

function makeDollar() {
  return new Proxy({}, {
    get(_, name) {
      return n.rule(name);
    },
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export function parseGrammar(grammarPath = GRAMMAR_PATH) {
  const src = fs.readFileSync(grammarPath, 'utf-8');

  // The sep() helper used in grammar.js must be available in the context
  const sepFn = (separator, rule) =>
    n.optional(n.seq(coerce(rule), n.repeat(n.seq(coerce(separator), coerce(rule)))));

  const ctx = {
    module: { exports: {} },
    exports: {},
    require: () => { throw new Error('require not allowed'); },
    // DSL globals
    grammar: (spec) => spec,
    ...dsl,
    sep: sepFn,
  };

  // Expose regex literals: grammar.js uses /pattern/ syntax
  vm.runInNewContext(src, ctx);

  const spec = ctx.module.exports;
  if (!spec || !spec.rules) throw new Error('grammar.js did not export a spec with .rules');

  const $ = makeDollar();
  const rules = {};

  for (const [ruleName, ruleFn] of Object.entries(spec.rules)) {
    try {
      rules[ruleName] = coerce(ruleFn($));
    } catch (e) {
      rules[ruleName] = n.terminal(`(parse error: ${e.message})`);
    }
  }

  return { name: spec.name || 'brightscript', rules };
}
