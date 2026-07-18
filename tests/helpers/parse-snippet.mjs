/**
 * tests/helpers/parse-snippet.mjs
 *
 * Parses a small BrightScript/BrighterScript source string through a real
 * `brighterscript` Program — used across the AST-dependent test files
 * instead of hand-rolling fake AST node shapes, per CLAUDE.md's testing
 * guidance: the compiler is this project's substrate, not an external
 * dependency to mock. A fresh Program per call keeps tests isolated.
 */

import { Program, ParseMode, isFunctionStatement, isClassStatement } from 'brighterscript';

/** Parse `source` as one file and return its brighterscript File (validated, disposed on next call is the caller's job — cheap enough not to bother). */
export function parseSnippet(source, filename = 'source/test.bs') {
  const program = new Program({ rootDir: '/virtual' });
  program.setFile(filename, source);
  program.validate();
  return { program, file: program.getFile(filename) };
}

/** First top-level FunctionStatement's `.func` (FunctionExpression) — what buildFunctionCfg/buildFunctionDfg expect. */
export function firstFunctionExpr(source, filename) {
  const { file } = parseSnippet(source, filename);
  const stmt = file.ast.statements.find(isFunctionStatement);
  if (!stmt) throw new Error('no FunctionStatement found in snippet');
  return stmt.func;
}

/** First top-level ClassStatement. */
export function firstClass(source, filename) {
  const { file } = parseSnippet(source, filename);
  const stmt = file.ast.statements.find(isClassStatement);
  if (!stmt) throw new Error('no ClassStatement found in snippet');
  return stmt;
}

export { ParseMode };
