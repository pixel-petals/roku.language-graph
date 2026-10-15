module.exports = grammar({
  name: 'brightscript',

  word: $ => $.identifier,

  conflicts: $ => [
    [$.if_statement, $.else_if_clause],
    [$.assignment_target, $.primary_expression],
    [$.assignment_target, $._expression],
  ],

  extras: $ => [
    /\s/,
    $.comment,
  ],

  rules: {
    // Entry point
    source_file: $ => repeat($._statement),

    // Statements
    _statement: $ => choice(
      $.if_statement,
      $.while_statement,
      $.for_statement,
      $.for_each_statement,
      $.sub_statement,
      $.function_statement,
      $.return_statement,
      $.goto_statement,
      $.assignment_statement,
      $.exit_while_statement,
      $.exit_for_statement,
      $.print_statement,
      $.empty_statement,
    ),

    // Control Flow
    if_statement: $ => seq(
      'if',
      field('condition', $._expression),
      'then',
      repeat($._statement),
      repeat($.else_if_clause),
      optional($.else_clause),
      'end',
      'if'
    ),

    else_if_clause: $ => seq(
      'else',
      'if',
      field('condition', $._expression),
      'then',
      repeat($._statement),
    ),

    else_clause: $ => seq(
      'else',
      repeat($._statement),
    ),

    while_statement: $ => seq(
      'while',
      field('condition', $._expression),
      repeat($._statement),
      'end',
      'while'
    ),

    exit_while_statement: $ => seq(
      'exit',
      'while'
    ),

    for_statement: $ => seq(
      'for',
      field('variable', $.identifier),
      '=',
      field('start', $._expression),
      'to',
      field('end', $._expression),
      optional(seq('step', field('step', $._expression))),
      repeat($._statement),
      'end',
      'for'
    ),

    exit_for_statement: $ => seq(
      'exit',
      'for'
    ),

    for_each_statement: $ => seq(
      'for',
      'each',
      field('variable', $.identifier),
      'in',
      field('collection', $._expression),
      repeat($._statement),
      'end',
      'for'
    ),

    goto_statement: $ => seq(
      'goto',
      field('label', $.identifier)
    ),

    return_statement: $ => prec.right(seq(
      'return',
      optional(field('value', $._expression))
    )),

    print_statement: $ => prec.right(seq(
      choice('print', '?'),
      optional($._expression)
    )),

    // Functions and Subroutines
    function_statement: $ => seq(
      'function',
      field('name', $.identifier),
      field('parameters', $.parameter_list),
      optional(seq('as', field('return_type', $.type))),
      repeat($._statement),
      'end',
      'function'
    ),

    sub_statement: $ => seq(
      'sub',
      field('name', $.identifier),
      field('parameters', $.parameter_list),
      repeat($._statement),
      'end',
      'sub'
    ),

    parameter_list: $ => seq(
      '(',
      optional(sep(',', $.parameter)),
      ')'
    ),

    parameter: $ => seq(
      field('name', $.identifier),
      optional(seq('as', field('type', $.type)))
    ),

    // Statements
    assignment_statement: $ => seq(
      field('left', $.assignment_target),
      '=',
      field('right', $._expression)
    ),

    assignment_target: $ => choice(
      $.identifier,
      $.member_access,
      $.subscript_access
    ),

    empty_statement: $ => ';',

    // Expressions — all types listed directly so every single expression
    // is a valid _expression without needing a chain of pass-throughs.
    // prec values on each binary rule handle disambiguation.
    _expression: $ => choice(
      $.ternary_expression,
      $.logical_or_expression,
      $.logical_and_expression,
      $.bitwise_or_expression,
      $.bitwise_xor_expression,
      $.bitwise_and_expression,
      $.equality_expression,
      $.relational_expression,
      $.shift_expression,
      $.additive_expression,
      $.multiplicative_expression,
      $.exponentiation_expression,
      $.unary_expression,
      $.call_expression,
      $.member_access,
      $.subscript_access,
      $.optional_chaining_expression,
      $.primary_expression,
    ),

    ternary_expression: $ => prec.right(1,
      seq(
        field('condition', $._expression),
        '?',
        field('consequence', $._expression),
        ':',
        field('alternative', $._expression)
      )
    ),

    logical_or_expression: $ => prec.left(2,
      seq(
        field('left', $._expression),
        choice('or', 'OR'),
        field('right', $._expression)
      )
    ),

    logical_and_expression: $ => prec.left(3,
      seq(
        field('left', $._expression),
        choice('and', 'AND'),
        field('right', $._expression)
      )
    ),

    bitwise_or_expression: $ => prec.left(4,
      seq(
        field('left', $._expression),
        '|',
        field('right', $._expression)
      )
    ),

    bitwise_xor_expression: $ => prec.left(5,
      seq(
        field('left', $._expression),
        'XOR',
        field('right', $._expression)
      )
    ),

    bitwise_and_expression: $ => prec.left(6,
      seq(
        field('left', $._expression),
        '&',
        field('right', $._expression)
      )
    ),

    equality_expression: $ => prec.left(7,
      seq(
        field('left', $._expression),
        choice('=', '<>', '!='),
        field('right', $._expression)
      )
    ),

    relational_expression: $ => prec.left(8,
      seq(
        field('left', $._expression),
        choice('<', '>', '<=', '>='),
        field('right', $._expression)
      )
    ),

    shift_expression: $ => prec.left(9,
      seq(
        field('left', $._expression),
        choice('<<', '>>'),
        field('right', $._expression)
      )
    ),

    additive_expression: $ => prec.left(10,
      seq(
        field('left', $._expression),
        choice('+', '-'),
        field('right', $._expression)
      )
    ),

    multiplicative_expression: $ => prec.left(11,
      seq(
        field('left', $._expression),
        choice('*', '/', 'mod', 'MOD'),
        field('right', $._expression)
      )
    ),

    exponentiation_expression: $ => prec.right(12,
      seq(
        field('left', $._expression),
        '^',
        field('right', $._expression)
      )
    ),

    unary_expression: $ => prec.right(13,
      seq(
        choice('-', '+', 'not', 'NOT'),
        field('operand', $._expression)
      )
    ),

    call_expression: $ => prec(15,
      seq(
        field('function', $.identifier),
        field('arguments', $.arguments)
      )
    ),

    member_access: $ => prec.left(16,
      seq(
        field('object', $._expression),
        '.',
        field('property', $.identifier)
      )
    ),

    subscript_access: $ => prec.left(16,
      seq(
        field('object', $._expression),
        '[',
        field('index', $._expression),
        ']'
      )
    ),

    optional_chaining_expression: $ => prec.left(16, choice(
      seq(
        field('object', $._expression),
        '?.',
        field('property', $.identifier)
      ),
      seq(
        field('object', $._expression),
        '?@',
        field('property', $.identifier)
      ),
      seq(
        field('object', $._expression),
        '?[',
        field('index', $._expression),
        ']'
      ),
      seq(
        field('function', $._expression),
        '?(',
        optional(sep(',', $._expression)),
        ')'
      )
    )),

    arguments: $ => seq(
      '(',
      optional(sep(',', $._expression)),
      ')'
    ),

    primary_expression: $ => choice(
      $.identifier,
      $.number,
      $.string,
      $.boolean,
      $.invalid_literal,
      $.array_literal,
      $.associative_array_literal,
      $.parenthesized_expression,
      $.create_object
    ),

    parenthesized_expression: $ => seq(
      '(',
      $._expression,
      ')'
    ),

    array_literal: $ => seq(
      '[',
      optional(sep(',', $._expression)),
      ']'
    ),

    associative_array_literal: $ => seq(
      '{',
      optional(sep(',', $.key_value_pair)),
      '}'
    ),

    key_value_pair: $ => seq(
      field('key', choice($.identifier, $.string)),
      ':',
      field('value', $._expression)
    ),

    create_object: $ => seq(
      'CreateObject',
      '(',
      field('component_type', $.string),
      ')'
    ),

    // Types
    type: $ => choice(
      'Boolean',
      'Integer',
      'LongInteger',
      'Float',
      'Double',
      'String',
      'Object',
      'Dynamic',
      'Void',
      'Invalid',
      $.identifier // For custom types
    ),

    // Literals — order: most-specific first for maximal-munch disambiguation
    number: $ => choice(
      $.hexadecimal,
      $.double,
      $.long_integer,
      $.float,
      $.integer,
    ),

    hexadecimal: $ => /0[xX][0-9a-fA-F]+/,

    double: $ => /[0-9]+\.[0-9]+[dD]/,

    long_integer: $ => /[0-9]+[lL]/,

    float: $ => /[0-9]+\.[0-9]+[fF]?/,

    integer: $ => /[0-9]+/,

    string: $ => seq('"', repeat(/[^"\n]/), '"'),

    boolean: $ => choice(
      'true',
      'false',
      'TRUE',
      'FALSE'
    ),

    invalid_literal: $ => choice(
      'invalid',
      'INVALID'
    ),

    identifier: $ => /[a-zA-Z_][a-zA-Z0-9_]*[%$!#]?/,

    comment: $ => token(choice(
      seq("'", /.*/),
      seq(/[Rr][Ee][Mm]/, /.*/)
    )),
  }
});

function sep(separator, rule) {
  return optional(seq(rule, repeat(seq(separator, rule))))
}
