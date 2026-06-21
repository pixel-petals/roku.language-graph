'use strict';

const Graph = require('graphology').default || require('graphology');

/**
 * Walks a tree-sitter AST and builds a code graph from it.
 *
 * Nodes  = functions / subroutines
 * Edges  = call relationships (caller -> callee)
 */
class BrightScriptGraph {
  constructor() {
    this.graph = new Graph({ multi: false, type: 'directed' });
    this._currentScope = null;
  }

  /**
   * Build the graph from a tree-sitter parse tree root node.
   */
  build(rootNode) {
    this._traverse(rootNode);
    return this;
  }

  _traverse(node) {
    const isScope = node.type === 'function_statement' || node.type === 'sub_statement';
    const savedScope = this._currentScope;

    if (isScope) this._enterScope(node);
    if (node.type === 'call_expression') this._recordCall(node);

    for (let i = 0; i < node.childCount; i++) {
      this._traverse(node.child(i));
    }

    if (isScope) this._currentScope = savedScope;
  }

  _enterScope(node) {
    // tree-sitter 0.20.x exposes named fields as `node.<fieldName>Node`
    const nameNode = node.nameNode;
    const name = nameNode ? nameNode.text : '<anonymous>';
    const kind = node.type === 'function_statement' ? 'function' : 'sub';

    if (!this.graph.hasNode(name)) {
      this.graph.addNode(name, {
        kind,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
      });
    }

    this._currentScope = name;
  }

  _recordCall(node) {
    const funcNode = node.functionNode;
    if (!funcNode) return;

    const callee = funcNode.text;
    const caller = this._currentScope || '<global>';

    if (!this.graph.hasNode(callee)) {
      this.graph.addNode(callee, { kind: 'unknown' });
    }
    if (!this.graph.hasNode(caller)) {
      this.graph.addNode(caller, { kind: 'unknown' });
    }

    const edgeKey = `${caller}->${callee}`;
    if (!this.graph.hasEdge(edgeKey)) {
      this.graph.addEdgeWithKey(edgeKey, caller, callee, { weight: 1 });
    } else {
      this.graph.updateEdgeAttribute(edgeKey, 'weight', w => w + 1);
    }
  }

  /** Return all defined functions/subs (non-unknown nodes). */
  getFunctions() {
    return this.graph
      .nodes()
      .filter(n => this.graph.getNodeAttribute(n, 'kind') !== 'unknown')
      .map(n => ({ name: n, ...this.graph.getNodeAttributes(n) }));
  }

  /** Return all call edges. */
  getCallEdges() {
    return this.graph.edges().map(e => ({
      from: this.graph.source(e),
      to: this.graph.target(e),
      weight: this.graph.getEdgeAttribute(e, 'weight'),
    }));
  }

  /** Render as DOT (Graphviz) format. */
  toDot() {
    const lines = ['digraph BrightScriptCallGraph {', '  rankdir=TB;', '  node [shape=box, style=filled, fillcolor="#E8F4F8"];', ''];

    for (const node of this.graph.nodes()) {
      const attrs = this.graph.getNodeAttributes(node);
      const label = attrs.kind !== 'unknown'
        ? `${node}\\n[${attrs.kind}, line ${attrs.startLine}-${attrs.endLine}]`
        : node;
      const color = attrs.kind === 'unknown' ? '#F5F5F5' : '#E8F4F8';
      lines.push(`  "${node}" [label="${label}", fillcolor="${color}"];`);
    }

    lines.push('');
    for (const edge of this.graph.edges()) {
      const from = this.graph.source(edge);
      const to = this.graph.target(edge);
      const weight = this.graph.getEdgeAttribute(edge, 'weight');
      lines.push(`  "${from}" -> "${to}" [label="${weight}"];`);
    }

    lines.push('}');
    return lines.join('\n');
  }

  /** Render as JSON summary. */
  toJSON() {
    return {
      functions: this.getFunctions(),
      calls: this.getCallEdges(),
    };
  }
}

module.exports = { BrightScriptGraph };
