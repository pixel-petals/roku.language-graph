/**
 * roku-app.ast-utils.mjs
 *
 * Low-level AST helpers shared across roku-app.brs.mjs, roku-app.cfg.mjs,
 * roku-app.dfg.mjs, roku-app.flow-adapter.mjs, and roku-app.xml.mjs.
 */

import * as crypto from 'crypto';

const ORIGIN = { line: 0, col: 0 };

export function fileHash(contents) {
  return crypto.createHash('sha1').update(contents).digest('hex');
}

export function posOf(node) {
  const start = node?.location?.range?.start;
  return start ? { line: start.line + 1, col: start.character } : ORIGIN;
}

export function endLineOf(node) {
  return (node?.location?.range?.end?.line ?? -1) + 1;
}

/** Resolve a callee-ish expression to a dotted name string (foo, a.b.c, ...). */
export function exprText(node) {
  if (!node) return null;
  if (typeof node.getText === 'function') {
    const text = node.getText()?.trim() ?? '';
    if (text) return text;
  }
  const parts = [];
  let cur = node;
  while (cur) {
    const nameText = cur.name?.text ?? cur.tokens?.name?.text;
    if (!nameText) break;
    parts.unshift(nameText);
    cur = cur.obj;
  }
  return parts.length > 0 ? parts.join('.') : null;
}

/** Safely invoke a brighterscript resolution API that may throw on partial programs. */
export function safe(fn) {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

/**
 * Best-effort BrightScript value-kind classification from an expression's
 * own syntax — 'roSGNode' | 'AssociativeArray' | 'Array' | null (unknown
 * from this expression alone, e.g. a bare variable reference). Used for
 * copy-vs-reference semantics: roSGNode is always by-reference; Array/
 * AssociativeArray are by-reference within a node but deep-cloned crossing
 * a node boundary (callFunc, interface field get/set).
 */
export function classifyValueKind(expr) {
  if (!expr) return null;
  const kind = expr.constructor.name;
  if (kind === 'AALiteralExpression') return 'AssociativeArray';
  if (kind === 'ArrayLiteralExpression') return 'Array';
  if (kind === 'CallExpression') {
    const calleeText = expr.callee?.tokens?.name?.text ?? expr.callee?.name?.text;
    if (calleeText?.toLowerCase() === 'createobject') {
      const firstArg = expr.args?.[0]?.tokens?.value?.text?.replace(/^"|"$/g, '');
      if (firstArg?.toLowerCase() === 'rosgnode') return 'roSGNode';
      if (firstArg?.toLowerCase() === 'roassociativearray') return 'AssociativeArray';
      if (firstArg?.toLowerCase() === 'roarray') return 'Array';
    }
  }
  return null;
}

/** The nested statement-list "child scopes" of a control statement (branches/loop body/try+catch), for recursive block-nesting walks. */
export function nestedBlocksOf(stmt) {
  const kind = stmt.constructor.name;
  if (kind === 'IfStatement') {
    const branches = [stmt.thenBranch.statements];
    if (stmt.elseBranch) branches.push(stmt.elseBranch.constructor.name === 'IfStatement' ? [stmt.elseBranch] : stmt.elseBranch.statements);
    return branches;
  }
  if (kind === 'ForStatement' || kind === 'ForEachStatement' || kind === 'WhileStatement') {
    return [stmt.body.statements];
  }
  if (kind === 'TryCatchStatement') {
    return [stmt.tryBranch.statements, stmt.catchStatement.catchBranch.statements];
  }
  return [];
}
