'use strict';

const { parse } = require('./parser');
const { BrightScriptGraph } = require('./graph');
const queries = require('./queries');

/**
 * Analyze a BrightScript source string.
 * Returns { tree, graph, functions, calls, assignments, types }.
 */
function analyze(code) {
  const tree = parse(code);
  const graph = new BrightScriptGraph().build(tree.rootNode);

  return {
    tree,
    graph,
    functions: queries.queryFunctions(tree),
    calls: queries.queryCalls(tree),
    assignments: queries.queryAssignments(tree),
    types: queries.queryTypes(tree),
  };
}

module.exports = {
  analyze,
  parse,
  BrightScriptGraph,
  queries,
};
