/**
 * roku-app.cfg.mjs
 *
 * Builds a control-flow graph (basic blocks + FLOWS_TO edges) for a single
 * function/method body, plus cyclomatic-complexity-style metrics. Hand-built
 * from the public, stable statement AST (If/For/ForEach/While/Try/Goto) —
 * brighterscript has no exportable CFG of its own to lean on (see
 * roku-app.flow-adapter.mjs for the one place this project does lean on
 * compiler internals, for local-variable definitions instead).
 *
 * Approximations, stated rather than hidden: TryCatchStatement gets one
 * coarse `may-throw` edge (not per-statement exception precision — not
 * worth it for qualitative-analysis-grade output), and Goto/Label support
 * is best-effort (goto is rare in modern BrightScript).
 */

import { posOf } from './roku-app.ast-utils.mjs';

const CONTROL_KINDS = new Set([
  'IfStatement', 'ForStatement', 'ForEachStatement', 'WhileStatement',
  'TryCatchStatement', 'ReturnStatement', 'ExitStatement', 'ContinueStatement',
  'GotoStatement',
]);

function blockNode(functionQname, fp, index, lineStart, lineEnd, statementKinds) {
  return {
    kind: 'BasicBlock', name: `block:${index}`, qualifiedName: `${functionQname}::block:${index}`,
    filePath: fp, lineStart: lineStart ?? null, lineEnd: lineEnd ?? null, language: null,
    parentName: functionQname, params: null, returnType: null, modifiers: null, isTest: false, fileHash: null,
    extra: { statementCount: statementKinds.length, statementKinds },
  };
}

function flowEdge(fp, sourceQ, targetQ, branch, line, condition) {
  return {
    kind: 'FLOWS_TO', sourceQualified: sourceQ, targetQualified: targetQ, filePath: fp,
    line: line ?? 0, extra: { branch, condition: condition ?? null }, confidence: 1.0, confidenceTier: 'DECLARED',
  };
}

/** Mutable graph-building context: tracks blocks/edges as they're created and finalized. */
function createBuilder(functionQname, fp) {
  const nodes = [];
  const edges = [];
  let nextIndex = 0;

  function open() {
    return { index: nextIndex++, statements: [], lineStart: null, lineEnd: null };
  }

  function qname(block) {
    return `${functionQname}::block:${block.index}`;
  }

  function finalize(block) {
    const kinds = block.statements.map(s => s.constructor.name);
    nodes.push(blockNode(functionQname, fp, block.index, block.lineStart, block.lineEnd, kinds));
  }

  function append(block, stmt) {
    block.statements.push(stmt);
    const line = posOf(stmt).line;
    if (block.lineStart == null) block.lineStart = line;
    block.lineEnd = line;
  }

  function flow(sourceBlockOrQname, targetBlockOrQname, branch, line, condition) {
    const sourceQ = typeof sourceBlockOrQname === 'string' ? sourceBlockOrQname : qname(sourceBlockOrQname);
    const targetQ = typeof targetBlockOrQname === 'string' ? targetBlockOrQname : qname(targetBlockOrQname);
    edges.push(flowEdge(fp, sourceQ, targetQ, branch, line, condition));
  }

  return { nodes, edges, open, qname, finalize, append, flow };
}

/**
 * Walks a statement list, mutating `block` in place and opening new blocks
 * at control statements. Returns the block execution flows out of, or null
 * if every path already exited (return/throw/goto) — the caller shouldn't
 * wire a fallthrough edge from a null result.
 */
function walkStatements(statements, block, g, ctx) {
  for (const stmt of statements) {
    if (!block) return null;
    block = walkStatement(stmt, block, g, ctx);
  }
  return block;
}

function walkStatement(stmt, block, g, ctx) {
  const kind = stmt.constructor.name;
  if (!CONTROL_KINDS.has(kind)) {
    g.append(block, stmt);
    return block;
  }
  switch (kind) {
    case 'IfStatement': return walkIf(stmt, block, g, ctx);
    case 'ForStatement': return walkLoop(stmt, block, g, ctx, stmt.body, 'for');
    case 'ForEachStatement': return walkLoop(stmt, block, g, ctx, stmt.body, 'for-each');
    case 'WhileStatement': return walkLoop(stmt, block, g, ctx, stmt.body, 'while', stmt.condition);
    case 'TryCatchStatement': return walkTryCatch(stmt, block, g, ctx);
    case 'ReturnStatement': {
      g.append(block, stmt);
      g.finalize(block);
      g.flow(block, ctx.functionQname, 'return', posOf(stmt).line);
      return null;
    }
    case 'ExitStatement': {
      g.append(block, stmt);
      g.finalize(block);
      const isFor = /for/i.test(stmt.tokens?.loopType?.text ?? '');
      const target = isFor ? ctx.loopBreak : ctx.loopBreak; // same target regardless; kept explicit for readability
      if (target) g.flow(block, target, 'break', posOf(stmt).line);
      return null;
    }
    case 'ContinueStatement': {
      g.append(block, stmt);
      g.finalize(block);
      if (ctx.loopContinue) g.flow(block, ctx.loopContinue, 'continue', posOf(stmt).line);
      return null;
    }
    case 'GotoStatement': {
      g.append(block, stmt);
      g.finalize(block);
      const label = stmt.tokens?.label?.text;
      ctx.pendingGotos.push({ block, label, line: posOf(stmt).line });
      return null;
    }
    default:
      g.append(block, stmt);
      return block;
  }
}

function walkIf(stmt, block, g, ctx) {
  g.finalize(block);
  const conditionText = stmt.condition?.getText?.() ?? null;
  const line = posOf(stmt).line;

  const thenEntry = g.open();
  g.flow(block, thenEntry, 'then', line, conditionText);
  const thenExit = walkStatements(stmt.thenBranch.statements, thenEntry, g, ctx);
  if (thenExit) g.finalize(thenExit);

  let elseExit;
  if (stmt.elseBranch) {
    if (stmt.elseBranch.constructor.name === 'IfStatement') {
      // else-if chain: recurse as if it were its own statement, sharing the same merge point via the returned block
      const elseEntry = g.open();
      g.flow(block, elseEntry, 'else', line);
      elseExit = walkStatement(stmt.elseBranch, elseEntry, g, ctx);
      if (elseExit) g.finalize(elseExit);
    } else {
      const elseEntry = g.open();
      g.flow(block, elseEntry, 'else', line);
      elseExit = walkStatements(stmt.elseBranch.statements, elseEntry, g, ctx);
      if (elseExit) g.finalize(elseExit);
    }
  } else {
    elseExit = block; // no else: falling through the condition block itself merges directly
  }

  if (!thenExit && !elseExit) return null;
  const merge = g.open();
  if (thenExit) g.flow(thenExit, merge, 'merge', line);
  if (elseExit) g.flow(elseExit, merge, 'merge', line);
  return merge;
}

function walkLoop(stmt, block, g, ctx, body, loopKind, condition) {
  g.finalize(block);
  const line = posOf(stmt).line;
  const header = g.open();
  g.flow(block, header, 'loop-enter', line, condition?.getText?.() ?? null);
  g.finalize(header); // header has no statements of its own (represents the implicit condition test)

  const exit = g.open();
  const bodyEntry = g.open();
  g.flow(header, bodyEntry, 'loop-body', line);
  g.flow(header, exit, 'loop-exit', line);

  const innerCtx = { ...ctx, loopBreak: g.qname(exit), loopContinue: g.qname(header) };
  const bodyExit = walkStatements(body.statements, bodyEntry, g, innerCtx);
  if (bodyExit) {
    g.finalize(bodyExit);
    g.flow(bodyExit, header, 'loop-back', line);
  }
  void loopKind; // kept for readability at call sites; not currently branching on it
  return exit;
}

function walkTryCatch(stmt, block, g, ctx) {
  g.finalize(block);
  const line = posOf(stmt).line;

  const tryEntry = g.open();
  g.flow(block, tryEntry, 'try', line);
  const catchEntry = g.open();
  // Coarse approximation: any statement in the try body might throw and jump to catch.
  g.flow(tryEntry, catchEntry, 'may-throw', line);

  const tryExit = walkStatements(stmt.tryBranch.statements, tryEntry, g, ctx);
  if (tryExit) g.finalize(tryExit);
  const catchExit = walkStatements(stmt.catchStatement.catchBranch.statements, catchEntry, g, ctx);
  if (catchExit) g.finalize(catchExit);

  if (!tryExit && !catchExit) return null;
  const merge = g.open();
  if (tryExit) g.flow(tryExit, merge, 'merge', line);
  if (catchExit) g.flow(catchExit, merge, 'merge', line);
  return merge;
}

/** Resolve any goto statements against label positions collected during the walk (best-effort — goto is rare). */
function resolveGotos(ctx, g) {
  for (const { block, label, line } of ctx.pendingGotos) {
    const targetBlock = ctx.labels.get(label);
    if (targetBlock) g.flow(block, targetBlock, 'goto', line);
  }
}

function collectLabels(statements, out) {
  for (const stmt of statements) {
    if (stmt.constructor.name === 'LabelStatement') out.set(stmt.tokens?.name?.text, stmt);
  }
}

/**
 * Rudimentary Big-O label from loop nesting depth alone — not a real
 * algorithmic analysis (loop bounds, early exits, and actual behavior
 * aren't accounted for), just shape. A fallback tier for when no matching
 * benchmark measurement is available (see db.benchmark.mjs).
 */
function bigOFromLoopDepth(depth) {
  if (depth === 0) return 'O(1)';
  if (depth === 1) return 'O(n)';
  if (depth === 2) return 'O(n^2)';
  return `O(n^${depth})`;
}

function countComplexity(bodyStatements) {
  let decisionPoints = 0;
  let maxDepth = 0;
  let maxLoopDepth = 0;
  let exitPoints = 0;

  function walk(statements, depth, loopDepth) {
    maxDepth = Math.max(maxDepth, depth);
    maxLoopDepth = Math.max(maxLoopDepth, loopDepth);
    for (const stmt of statements) {
      const kind = stmt.constructor.name;
      if (kind === 'IfStatement') {
        decisionPoints++;
        walk(stmt.thenBranch.statements, depth + 1, loopDepth);
        if (stmt.elseBranch) {
          if (stmt.elseBranch.constructor.name === 'IfStatement') walk([stmt.elseBranch], depth + 1, loopDepth);
          else walk(stmt.elseBranch.statements, depth + 1, loopDepth);
        }
      } else if (kind === 'ForStatement' || kind === 'ForEachStatement' || kind === 'WhileStatement') {
        decisionPoints++;
        walk(stmt.body.statements, depth + 1, loopDepth + 1);
      } else if (kind === 'TryCatchStatement') {
        decisionPoints++;
        walk(stmt.tryBranch.statements, depth + 1, loopDepth);
        walk(stmt.catchStatement.catchBranch.statements, depth + 1, loopDepth);
      } else if (kind === 'ReturnStatement' || kind === 'ExitStatement') {
        exitPoints++;
      }
    }
  }
  walk(bodyStatements, 0, 0);

  return {
    cyclomaticComplexity: 1 + decisionPoints,
    maxNestingDepth: maxDepth,
    exitPointCount: Math.max(exitPoints, 1),
    loopNestingDepth: maxLoopDepth,
    estimatedBigO: bigOFromLoopDepth(maxLoopDepth),
    bigOBasis: 'loop-nesting-depth',
  };
}

/** Build a CFG + complexity metrics for a function/method body. */
export function buildFunctionCfg(func, functionQname, fp) {
  const g = createBuilder(functionQname, fp);
  const bodyStatements = func.body?.statements ?? [];

  const labels = new Map();
  collectLabels(bodyStatements, labels);
  const ctx = { functionQname, loopBreak: null, loopContinue: null, pendingGotos: [], labels };

  const entry = g.open();
  g.flow(functionQname, entry, 'entry', posOf(func).line);
  const exitBlock = walkStatements(bodyStatements, entry, g, ctx);
  if (exitBlock) {
    g.finalize(exitBlock);
    g.flow(exitBlock, functionQname, 'fallthrough', posOf(func).line);
  }

  resolveGotos(ctx, g);

  return { nodes: g.nodes, edges: g.edges, metrics: countComplexity(bodyStatements) };
}
