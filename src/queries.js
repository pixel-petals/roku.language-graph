'use strict';

const { getLanguage } = require('./parser');

let Parser;
try { Parser = require('tree-sitter'); } catch {}

/**
 * Run a tree-sitter S-expression query against a parsed tree.
 * Returns an array of capture objects: { name, text, startLine }.
 */
function runQuery(tree, queryStr) {
  if (!Parser) throw new Error('tree-sitter not available');
  const { Query } = Parser;
  const lang = getLanguage();
  const query = new Query(lang, queryStr);
  return query.captures(tree.rootNode).map(({ name, node }) => ({
    name,
    text: node.text,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    type: node.type,
  }));
}

const QUERIES = {
  functions: `
    (function_statement name: (identifier) @function.name)
    (sub_statement name: (identifier) @sub.name)
  `,
  calls: `
    (call_expression function: (identifier) @call.name)
  `,
  assignments: `
    (assignment_statement left: (assignment_target (identifier) @assignment.var))
  `,
  types: `
    (parameter type: (type) @type.param)
    (function_statement return_type: (type) @type.return)
  `,
  controlFlow: `
    (if_statement) @control.if
    (while_statement) @control.while
    (for_statement) @control.for
    (for_each_statement) @control.foreach
  `,
};

function queryFunctions(tree) { return runQuery(tree, QUERIES.functions); }
function queryCalls(tree) { return runQuery(tree, QUERIES.calls); }
function queryAssignments(tree) { return runQuery(tree, QUERIES.assignments); }
function queryTypes(tree) { return runQuery(tree, QUERIES.types); }
function queryControlFlow(tree) { return runQuery(tree, QUERIES.controlFlow); }

module.exports = {
  runQuery,
  QUERIES,
  queryFunctions,
  queryCalls,
  queryAssignments,
  queryTypes,
  queryControlFlow,
};
