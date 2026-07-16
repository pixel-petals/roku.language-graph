# Graphify Integration Guide for BrightScript Grammar

This guide explains how to integrate the tree-sitter-brightscript grammar with Graphify for code analysis, AST visualization, and graph-based code querying.

## Overview

Graphify is a tool for creating abstract syntax graph (ASG) representations of source code. Tree-sitter provides the parsing foundation, and this grammar enables Graphify to analyze BrightScript code.

## Integration Steps

### 1. Install the Grammar

```bash
npm install tree-sitter-brightscript
```

Or link locally:
```bash
cd tree-sitter-brightscript
npm run build
npm link
```

### 2. Configure Graphify

Create a `graphify.config.js`:

```javascript
module.exports = {
  language: 'brightscript',
  parser: require('tree-sitter-brightscript'),
  queries: {
    functions: `
      (function_statement
        name: (identifier) @name
        parameters: (parameter_list) @params)
    `,
    assignments: `
      (assignment_statement
        left: (identifier) @var
        right: (_) @value)
    `,
    calls: `
      (call_expression
        function: (identifier) @func
        arguments: (arguments) @args)
    `,
    control_flow: `
      [
        (if_statement)
        (while_statement)
        (for_statement)
      ] @block
    `
  },
  rules: [
    {
      name: 'function-definitions',
      pattern: 'functions',
      nodeType: 'function',
      properties: ['name', 'params']
    },
    {
      name: 'variable-assignments',
      pattern: 'assignments',
      nodeType: 'assignment',
      properties: ['var', 'value']
    },
    {
      name: 'function-calls',
      pattern: 'calls',
      nodeType: 'call',
      properties: ['func', 'args']
    }
  ]
};
```

### 3. Custom Query Examples

#### Find all function definitions

```scm
(function_statement
  name: (identifier) @function_name
  parameters: (parameter_list
    (parameter
      name: (identifier) @param_name
      type: (type) @param_type))
  return_type: (type) @return_type)
```

#### Track variable assignments

```scm
(assignment_statement
  left: (identifier) @variable
  right: (_) @assigned_value)

(assignment_statement
  left: (member_access
    object: (identifier) @object
    property: (identifier) @property)
  right: (_) @value)
```

#### Find function calls

```scm
(call_expression
  function: (identifier) @called_function
  arguments: (arguments
    (_) @argument))
```

#### Identify control flow

```scm
(if_statement
  condition: (_) @condition
  (else_if_clause
    condition: (_) @elif_condition)
  (else_clause))

(while_statement
  condition: (_) @condition)

(for_statement
  variable: (identifier) @loop_var
  start: (_) @start
  end: (_) @end)
```

#### Find type information

```scm
(parameter
  name: (identifier) @param
  type: (type) @type)

(function_statement
  name: (identifier) @function
  return_type: (type) @return_type)
```

#### Detect optional chaining

```scm
(optional_chaining_expression
  object: (_) @object
  property: (identifier) @property) @optional_access
```

### 4. Usage with Node.js

```javascript
const Parser = require('tree-sitter');
const BrightScript = require('tree-sitter-brightscript');
const { Query } = require('tree-sitter');
const fs = require('fs');

const parser = new Parser();
parser.setLanguage(BrightScript);

// Parse code
const code = fs.readFileSync('app.brs', 'utf-8');
const tree = parser.parse(code);

// Define queries
const functionQuery = `
  (function_statement
    name: (identifier) @func_name
    parameters: (parameter_list) @params)
`;

const query = new Query(BrightScript, functionQuery);

// Execute query
const captures = query.captures(tree.rootNode);
captures.forEach(({ name, node }) => {
  console.log(`${name}: ${node.text}`);
});
```

### 5. Creating Graphify Analysis Rules

```javascript
const { createAnalyzer } = require('graphify');

const analyzer = createAnalyzer({
  language: 'brightscript',
  rules: {
    // Rule 1: Track function dependencies
    functionDependencies: {
      pattern: 'calls',
      handler: (match, graph) => {
        const func = match.captures.find(c => c.name === 'func');
        const args = match.captures.find(c => c.name === 'args');
        graph.addEdge('calls', func.node.text, match.context.currentFunction);
      }
    },

    // Rule 2: Detect unused variables
    unusedVariables: {
      pattern: 'assignments',
      handler: (match, graph) => {
        const variable = match.captures.find(c => c.name === 'var');
        graph.trackVariable(variable.node.text, match.context);
      }
    },

    // Rule 3: Identify complex control flow
    controlFlowComplexity: {
      pattern: 'control_flow',
      handler: (match, graph) => {
        graph.incrementComplexity(match.context.currentFunction);
      }
    }
  }
});

// Run analysis
const results = analyzer.analyze(code);
```

### 6. Visualization with Graphify

```javascript
const { Graph, Visualizer } = require('graphify');

// Build ASG from parse tree
const graph = new Graph();

// Populate graph from parse tree
function traverseTree(node, graph, parent = null) {
  if (node.type === 'function_statement') {
    const funcName = node.child(1).text;
    graph.addNode('function', funcName, { parent });
  } else if (node.type === 'call_expression') {
    const callName = node.child(0).text;
    graph.addEdge('calls', parent, callName);
  }
  
  for (const child of node.children) {
    traverseTree(child, graph, parent);
  }
}

traverseTree(tree.rootNode, graph);

// Visualize
const visualizer = new Visualizer({
  format: 'dot',
  rankdir: 'TB',
  node: {
    shape: 'box',
    style: 'filled',
    fillcolor: '#E8F4F8'
  }
});

const dotGraph = visualizer.render(graph);
console.log(dotGraph);
```

## Common Patterns for Analysis

### 1. Function Call Graph

Extract which functions call which other functions:

```scm
(function_statement
  name: (identifier) @caller)

(call_expression
  function: (identifier) @callee)
```

### 2. Type Tracking

Track declared types and usage:

```scm
(parameter
  name: (identifier) @param
  type: (type) @param_type)

(assignment_statement
  left: (identifier) @var
  right: (create_object) @component_type)
```

### 3. Control Flow Graph

Build CFG from if/while/for statements:

```scm
(if_statement
  condition: (_) @branch_condition
  (else_if_clause)? @elif
  (else_clause)? @else)
```

### 4. Data Flow Analysis

Track variable definitions and uses:

```scm
(assignment_statement
  left: (identifier) @def
  right: (_) @rhs)

(identifier) @use
```

## Performance Considerations

For large codebases:

1. **Incremental Parsing**: Tree-sitter's strength
```javascript
// Update only changed portions
const newTree = parser.parse(newCode, tree);
```

2. **Query Optimization**: Limit capture scope
```scm
; Bad: Captures all identifiers
(identifier) @id

; Good: Captures only function parameters
(parameter
  name: (identifier) @param)
```

3. **Batch Processing**
```javascript
const files = fs.readdirSync('src').filter(f => f.endsWith('.brs'));
files.forEach(file => {
  const code = fs.readFileSync(`src/${file}`);
  analyzer.analyze(code, file);
});
```

## Debugging

Enable debug output:

```javascript
const parser = new Parser();
parser.setLanguage(BrightScript);

// Print parse tree
console.log(tree.rootNode.toString());

// Query debugging
query.captures(tree.rootNode).forEach(cap => {
  console.log(`${cap.name}: ${cap.node.type} "${cap.node.text}"`);
});
```

## Example: Call Graph Generator

```javascript
function generateCallGraph(code) {
  const parser = new Parser();
  parser.setLanguage(BrightScript);
  const tree = parser.parse(code);

  const callGraph = {};
  let currentFunction = 'global';

  function traverse(node) {
    if (node.type === 'function_statement') {
      currentFunction = node.child(1).text;
      callGraph[currentFunction] = [];
    } else if (node.type === 'call_expression') {
      const callee = node.child(0).text;
      callGraph[currentFunction].push(callee);
    }

    for (const child of node.children) {
      traverse(child);
    }
  }

  traverse(tree.rootNode);
  return callGraph;
}

// Usage
const graph = generateCallGraph(code);
console.log(JSON.stringify(graph, null, 2));
```

## Integration with Graphify CLI

```bash
# Analyze BrightScript project
graphify analyze --parser tree-sitter-brightscript ./src

# Generate graphs
graphify visualize --format dot --output graph.dot

# Generate reports
graphify report --metrics complexity --output report.json
```

## Troubleshooting

### Parser not found
```bash
# Rebuild grammar
npm run build

# Verify installation
npm list tree-sitter-brightscript
```

### Query syntax errors
- Check query syntax in highlights.scm
- Verify field names match grammar.js
- Use tree-sitter test mode: `tree-sitter test`

### Performance issues
- Profile with Node.js profiler
- Consider chunking large files
- Optimize queries to be more specific

## Additional Resources

- [Graphify Documentation](https://graphify.dev)
- [Tree-Sitter Query Language](https://tree-sitter.github.io/tree-sitter/using-parsers/querying)
- [BrightScript Language Reference](https://developer.roku.com/docs/references/brightscript)
