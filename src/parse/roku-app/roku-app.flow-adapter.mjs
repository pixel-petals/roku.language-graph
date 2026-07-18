/**
 * roku-app.flow-adapter.mjs
 *
 * Our own stable contract for "every local variable definition within a
 * function, with real source positions" — deliberately decoupled from HOW
 * that's computed, so the brighterscript-internals-based implementation
 * below can be swapped for a hand-rolled one later without touching
 * roku-app.dfg.mjs or any other caller.
 *
 * Contract: getLocalDefs(func) -> LocalDefInfo[]
 *   { varName, node, line, col, scopeDepth, typeName }
 *
 * ponytail: implemented via brighterscript's SymbolTable/PocketTable
 * internals (undocumented, alpha-stage compiler API — see the CFG/DFG plan
 * for the verification that grounds this) rather than a hand-rolled
 * statement walk, because enumerating every local variable correctly across
 * nested branch/loop scopes is exactly what the compiler's own type checker
 * already has to get right, and is easy to get subtly wrong by hand.
 *
 * If a future brighterscript release changes this shape and breaks
 * getLocalDefsViaCompilerInternals, swap it for a DIY implementation of
 * getLocalDefsDiy (stubbed below) — callers never need to change, they only
 * ever call the exported getLocalDefs().
 */

import { SymbolTypeFlag } from 'brighterscript';
import { posOf, nestedBlocksOf } from './roku-app.ast-utils.mjs';

/** Recursively collect every SymbolTable reachable from `table` via pocketTables (branch/loop-scoped child tables). */
function collectTables(table, depth, out) {
  out.push({ table, depth });
  for (const pocket of table.pocketTables ?? []) {
    collectTables(pocket.table, depth + 1, out);
  }
}

function getLocalDefsViaCompilerInternals(func) {
  const rootTable = func.body?.getSymbolTable();
  if (!rootTable) return [];

  const tables = [];
  collectTables(rootTable, 0, tables);

  const defs = [];
  for (const { table, depth } of tables) {
    for (const symbol of table.getOwnSymbols(SymbolTypeFlag.runtime)) {
      const entries = table.getSymbolTypes(symbol.name, { flags: SymbolTypeFlag.runtime }, true) ?? [];
      for (const entry of entries) {
        const node = entry.data?.definingNode;
        const pos = posOf(node);
        if (!node || pos.line === 0) continue;
        defs.push({
          varName: symbol.name, node, line: pos.line, col: pos.col, scopeDepth: depth,
          typeName: entry.type?.toString?.() ?? null,
        });
      }
    }
  }
  return defs;
}

/**
 * Patch for a real gap found in getLocalDefsViaCompilerInternals: loop
 * counters/items (ForStatement.counterDeclaration, ForEachStatement's item
 * token) don't carry a `data.definingNode` the way a plain
 * AssignmentStatement does — verified against createGrid's `for i`/`for j`,
 * where getSymbolTypes('i', ...) returns an entry with no definingNode at
 * all. These are structurally trivial to find directly on the AST, so this
 * fills the gap by hand (recursive statement walk, same shape as
 * roku-app.cfg.mjs's countComplexity) rather than accepting silently-missing
 * defs.
 */
function collectLoopCounterDefs(statements, depth, defs) {
  for (const stmt of statements) {
    const kind = stmt.constructor.name;
    if (kind === 'ForStatement') {
      const pos = posOf(stmt.counterDeclaration);
      defs.push({ varName: stmt.counterDeclaration.tokens.name.text, node: stmt.counterDeclaration, line: pos.line, col: pos.col, scopeDepth: depth + 1, typeName: null });
    } else if (kind === 'ForEachStatement') {
      const pos = posOf(stmt);
      defs.push({ varName: stmt.tokens.item.text, node: stmt, line: pos.line, col: pos.col, scopeDepth: depth + 1, typeName: null });
    }
    for (const nested of nestedBlocksOf(stmt)) collectLoopCounterDefs(nested, depth + 1, defs);
  }
}

// ponytail: DIY fallback — not implemented, only needed if
// getLocalDefsViaCompilerInternals breaks on a future brighterscript
// version. Would walk AssignmentStatement/AugmentedAssignmentStatement/
// DimStatement/ForStatement-counter/ForEachStatement-item directly via
// func.body.walk(), the same statement kinds roku-app.cfg.mjs already
// visits for control flow — swap the export below to point here instead.
// function getLocalDefsDiy(func) { throw new Error('not implemented'); }

// TODO: getLocalDefsViaCompilerInternals itself can return two identical
// entries for the same varName@line (confirmed on a real ~13k-node app:
// 200 duplicate LocalDef qualifiedNames, all byte-for-byte identical —
// e.g. a FunctionParameterExpression binding visited twice via nested
// pocket tables). roku-app.dfg.mjs currently masks this at the storage
// layer (pglite.db.mjs dedupes by qualifiedName, last-write-wins), but the
// double-visit itself is unfixed here. Root-cause: dedupe `defs` below the
// same way loopCounterDefs already gets deduped against `seen`, or trace
// why getSymbolTypes/pocketTables walk visits some symbols twice.

/** Every local-variable definition in `func`, across nested branch/loop scopes. */
export function getLocalDefs(func) {
  const defs = getLocalDefsViaCompilerInternals(func);
  const seen = new Set(defs.map(d => `${d.varName}@${d.line}`));

  const loopCounterDefs = [];
  collectLoopCounterDefs(func.body?.statements ?? [], 0, loopCounterDefs);
  for (const d of loopCounterDefs) {
    const key = `${d.varName}@${d.line}`;
    if (!seen.has(key)) { defs.push(d); seen.add(key); }
  }

  return defs;
}
