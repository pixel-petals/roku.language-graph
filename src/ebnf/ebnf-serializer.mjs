/**
 * ebnf-serializer.mjs
 *
 * Converts the AST produced by grammar-parser into W3C-style EBNF text.
 *
 * Notation used:
 *   rule    ::= ...          (* non-terminal definition *)
 *   "token"                  (* terminal string *)
 *   PATTERN                  (* terminal pattern — regex described in prose *)
 *   a b c                    (* sequence — implicit concatenation *)
 *   a | b                    (* alternation *)
 *   [ a ]                    (* optional *)
 *   { a }                    (* zero-or-more *)
 *   a { a }                  (* one-or-more — no + shorthand in ISO EBNF *)
 *   ( a | b )                (* grouping *)
 *   (* comment *)            (* EBNF comment *)
 */

// ── Regex → human-readable name ───────────────────────────────────────────────

// Map regex sources (as they appear in .source) to readable EBNF terminal names.
// Keys must match exactly what JavaScript's RegExp.prototype.source returns.
const REGEX_NAMES = {
  '\\s':                              'WHITESPACE',
  '[a-zA-Z_][a-zA-Z0-9_]*[%$!#]?':  'IDENTIFIER',
  '[0-9]+':                           'DIGITS',
  '[0-9]+\\.[0-9]+[dD]':             'DOUBLE_LITERAL',
  '[0-9]+[lL]':                       'LONG_INTEGER_LITERAL',
  '[0-9]+\\.[0-9]+[fF]?':            'FLOAT_LITERAL',
  '0[xX][0-9a-fA-F]+':               'HEX_LITERAL',
  '[^"\\n]*':                         'STRING_CHARS',
  '[^"\\n]':                          'STRING_CHAR',
  '.*':                               'REST_OF_LINE',
  '[Rr][Ee][Mm]':                     '"rem"',
};

function regexToName(source) {
  return REGEX_NAMES[source] || `/${source}/`;
}

// ── Serializer ────────────────────────────────────────────────────────────────

// Operator precedence for deciding when to add parens
const PREC = { seq: 1, choice: 0 };

function serialize(node, parentType = null) {
  if (!node) return '""';

  switch (node.type) {
    case 'terminal': {
      if (!node.value) return '""';
      // Escape double-quotes inside terminals so they don't break EBNF readers
      const escaped = node.value.replace(/"/g, '\\"');
      return `"${escaped}"`;
    }

    case 'regex':
      return regexToName(node.source);

    case 'rule':
      return node.name.startsWith('_') ? node.name.slice(1) : node.name;

    case 'token':
      return serialize(node.item, 'token');

    case 'optional':
      return `[ ${serialize(node.item)} ]`;

    case 'repeat':
      return `{ ${serialize(node.item)} }`;

    case 'repeat1': {
      const inner = serialize(node.item);
      return `${inner} { ${inner} }`;
    }

    case 'seq': {
      const parts = node.items.map(i => {
        const s = serialize(i, 'seq');
        // Wrap a choice inside a seq in parens
        if (i.type === 'choice') return `( ${s} )`;
        return s;
      });
      const joined = parts.join(', ');
      return parentType === 'choice' ? `( ${joined} )` : joined;
    }

    case 'choice': {
      const parts = node.items.map(i => serialize(i, 'choice'));
      return parts.join('\n    | ');
    }

    default:
      return `(* unknown node type: ${node.type} *)`;
  }
}

export function ruleToEbnf(name, node) {
  const lhs = name.padEnd(36);
  const rhs = serialize(node);
  return `${lhs}::= ${rhs} ;`;
}

// ── Section grouping ──────────────────────────────────────────────────────────

const SECTIONS = [
  {
    heading: 'Program Structure',
    rules: ['source_file'],
  },
  {
    heading: 'Statements',
    rules: [
      '_statement', 'if_statement', 'else_if_clause', 'else_clause',
      'while_statement', 'exit_while_statement',
      'for_statement', 'exit_for_statement', 'for_each_statement',
      'goto_statement', 'return_statement', 'print_statement',
      'assignment_statement', 'assignment_target', 'empty_statement',
    ],
  },
  {
    heading: 'Functions & Subroutines',
    rules: ['function_statement', 'sub_statement', 'parameter_list', 'parameter'],
  },
  {
    heading: 'Expressions',
    rules: [
      '_expression',
      'ternary_expression',
      'logical_or_expression', 'logical_and_expression',
      'bitwise_or_expression', 'bitwise_xor_expression', 'bitwise_and_expression',
      'equality_expression', 'relational_expression',
      'shift_expression', 'additive_expression', 'multiplicative_expression',
      'exponentiation_expression', 'unary_expression',
      'call_expression', 'member_access', 'subscript_access',
      'optional_chaining_expression',
      'arguments',
    ],
  },
  {
    heading: 'Primary Expressions',
    rules: [
      'primary_expression', 'parenthesized_expression',
      'array_literal', 'associative_array_literal', 'key_value_pair',
      'create_object',
    ],
  },
  {
    heading: 'Types',
    rules: ['type'],
  },
  {
    heading: 'Literals & Terminals',
    rules: ['number', 'hexadecimal', 'double', 'long_integer', 'float', 'integer',
            'string', 'boolean', 'invalid_literal', 'identifier', 'comment'],
  },
];

export function grammarToEbnf(parsed) {
  const { name, rules } = parsed;
  const lines = [];
  const emitted = new Set();

  lines.push(`(* ═══════════════════════════════════════════════════════════════`);
  lines.push(`   BrightScript Language Grammar — EBNF`);
  lines.push(`   Derived from tree-sitter-brightscript grammar.js`);
  lines.push(`   W3C-style notation: , = seq  | = alt  [ ] = opt  { } = repeat`);
  lines.push(`   ═══════════════════════════════════════════════════════════════ *)`);
  lines.push('');

  for (const section of SECTIONS) {
    lines.push(`(* ─── ${section.heading} ${'─'.repeat(Math.max(0, 50 - section.heading.length))} *)`);
    lines.push('');
    for (const ruleName of section.rules) {
      if (rules[ruleName]) {
        lines.push(ruleToEbnf(ruleName.startsWith('_') ? ruleName.slice(1) : ruleName, rules[ruleName]));
        emitted.add(ruleName);
      }
    }
    lines.push('');
  }

  // Emit any leftover rules not covered by sections
  const leftover = Object.keys(rules).filter(r => !emitted.has(r));
  if (leftover.length) {
    lines.push('(* ─── Miscellaneous ──────────────────────────────────────────── *)');
    lines.push('');
    for (const ruleName of leftover) {
      lines.push(ruleToEbnf(ruleName.startsWith('_') ? ruleName.slice(1) : ruleName, rules[ruleName]));
    }
    lines.push('');
  }

  return lines.join('\n');
}
