/**
 * roku-app.dfg.mjs
 *
 * Builds an approximate local-variable data-flow graph for a single
 * function/method body: a `LocalDef` node per variable binding (from
 * roku-app.flow-adapter.mjs) and `USES` edges from the enclosing function to
 * the def a given read most plausibly sees.
 *
 * This is explicitly an approximation, not real reaching-definitions
 * analysis: a `VariableExpression` read resolves to the nearest preceding
 * same-name `LocalDef` whose scope contains the read (its own statement
 * nesting or an ancestor), by source line — not a CFG-aware/branch-precise
 * resolution. Always tagged confidenceTier 'TEXTUAL'.
 */

import { isCallExpression, isNewExpression, WalkMode, createVisitor } from 'brighterscript';
import { posOf, exprText, nestedBlocksOf, classifyValueKind } from './roku-app.ast-utils.mjs';
import { getLocalDefs } from './roku-app.flow-adapter.mjs';

function valueExprOf(node) {
  if ('value' in node) return node.value;
  if (node.constructor.name === 'ForEachStatement') return node.target;
  return null;
}

/** Best-effort value kind: direct expression syntax first, falling back to the compiler's inferred type name when more specific than 'dynamic'. */
function valueKindOf(node, typeName) {
  const fromExpr = classifyValueKind(valueExprOf(node));
  if (fromExpr) return fromExpr;
  if (typeName && typeName !== 'dynamic') {
    const lower = typeName.toLowerCase();
    if (lower.includes('sgnode') || lower.includes('node')) return 'roSGNode';
    if (lower.includes('associativearray')) return 'AssociativeArray';
    if (lower.includes('array')) return 'Array';
  }
  return 'unknown';
}

function defNode(functionQname, fp, lang, d) {
  return {
    kind: 'LocalDef', name: d.varName, qualifiedName: `${functionQname}::def:${d.varName}@${d.line}`,
    filePath: fp, lineStart: d.line, lineEnd: d.line, language: lang,
    parentName: functionQname, params: null, returnType: d.typeName, modifiers: null, isTest: false, fileHash: null,
    extra: {
      varName: d.varName, bindingKind: d.node.constructor.name, scopeDepth: d.scopeDepth,
      valueText: exprText(valueExprOf(d.node)), valueKind: valueKindOf(d.node, d.typeName),
    },
  };
}

function buildStatementDepthMap(statements, depth, map) {
  for (const stmt of statements) {
    map.set(stmt, depth);
    for (const nested of nestedBlocksOf(stmt)) buildStatementDepthMap(nested, depth + 1, map);
  }
}

/** Depth of the nearest enclosing statement recorded in `depthMap`, walking up from any AST node. */
function depthOfNode(node, depthMap) {
  let cur = node;
  while (cur) {
    if (depthMap.has(cur)) return depthMap.get(cur);
    cur = cur.parent;
  }
  return 0;
}

function groupDefsByName(defs) {
  const byName = new Map();
  for (const d of defs) {
    if (!byName.has(d.varName)) byName.set(d.varName, []);
    byName.get(d.varName).push(d);
  }
  for (const list of byName.values()) list.sort((a, b) => a.line - b.line);
  return byName;
}

/** The nearest preceding, scope-compatible def for a read at (readLine, readDepth), or null. */
function resolveUse(candidates, readLine, readDepth) {
  let best = null;
  for (const d of candidates) {
    if (d.line >= readLine) break; // sorted ascending; a def can't reach a use it comes after (or on the same line — avoids self-resolving `x = x + 1`)
    if (d.scopeDepth > readDepth) continue; // def's scope isn't an ancestor of (or equal to) the read's
    best = d;
  }
  return best;
}

/** Build a LocalDef/USES graph for a function/method body. */
export function buildFunctionDfg(func, functionQname, fp, lang) {
  const defs = getLocalDefs(func);
  const nodes = defs.map(d => defNode(functionQname, fp, lang, d));

  const depthMap = new Map();
  buildStatementDepthMap(func.body?.statements ?? [], 0, depthMap);
  const defsByName = groupDefsByName(defs);

  const edges = [];
  func.body?.walk(createVisitor({
    VariableExpression: (expr) => {
      const parent = expr.parent;
      if (isNewExpression(parent)) return;
      if (isCallExpression(parent) && parent.callee === expr) return;
      const name = expr.tokens?.name?.text ?? expr.name?.text;
      const candidates = name && defsByName.get(name);
      if (!candidates) return;

      const pos = posOf(expr);
      const best = resolveUse(candidates, pos.line, depthOfNode(expr, depthMap));
      if (!best) return;

      edges.push({
        kind: 'USES', sourceQualified: functionQname,
        targetQualified: `${functionQname}::def:${best.varName}@${best.line}`,
        filePath: fp, line: pos.line, extra: { col: pos.col },
        confidence: 0.5, confidenceTier: 'TEXTUAL',
      });
    },
  }), { walkMode: WalkMode.visitAllRecursive });

  return { nodes, edges };
}
