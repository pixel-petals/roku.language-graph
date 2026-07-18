/**
 * jsdoc.extract.mjs
 *
 * Turns a node's raw BrightScriptDoc comment (see `docCommentFor` in
 * roku-app.brs.mjs) into a proper JSDoc block, via
 * github.com/markwpearce/brighterscript-jsdocs-plugin — it already handles
 * both `'`-line and `' /** *\/`-block BrightScriptDoc styles and matches
 * `@param`/`@return` tag overrides to real parameter names.
 *
 * The plugin has no exported per-declaration API — only a whole-file
 * converter (`convertBrighterscriptDocs`) meant to feed the real `jsdoc`
 * CLI. Rather than convert a whole file and map its output back onto our
 * own AST-derived nodes (fragile name matching, especially across
 * same-named methods on different classes), we synthesize a minimal
 * single-declaration snippet (`jsdoc.snippets.mjs`) and run just that
 * through the plugin. It carries its own bundled `brighterscript` (a much
 * older version than the one pinned for our own parsing), used only for
 * this comment conversion.
 *
 * A leading blank line is required before the comment: the plugin fails to
 * associate a doc comment that starts on line 0 of the source with the
 * declaration below it (verified — a comment on line 1+ associates fine
 * regardless of length, line 0 silently loses its description text even
 * though `@param`/`@returns` still get auto-generated from the AST). Since
 * our synthesized snippets always put the comment first, this isn't an
 * edge case for us — it's every single call — so the blank line is
 * unconditional, not a fallback.
 */

import { convertBrighterscriptDocs } from 'brighterscript-jsdocs-plugin/convert-brighterscript-docs.js';
import { SNIPPETS } from './jsdoc.snippets.mjs';

const JSDOC_BLOCK = /\/\*\*[\s\S]*?\*\//;

const toCommentBlock = (doc) => `\n${doc.split('\n').map(line => `' ${line}`).join('\n')}`;

/**
 * Best-effort JSDoc block for one declaration, to be spread into that
 * node's `extra` (`...extractJsDoc(node)`). Two outcomes, both meant to be
 * distinguishable downstream (see `pglite.db.mjs`'s `flush()`):
 *
 * - Success (including "there's no comment, or the plugin legitimately
 *   produced nothing") -> `{ jsdoc: string }` — an authoritative value,
 *   `''` included, that should overwrite whatever was stored before.
 * - Failure (the plugin threw — a bad synthesized snippet, an unexpected
 *   AST shape) -> `{ jsdocError: true }`, no `jsdoc` key at all, logged to
 *   console. A bad jsdoc run must never break the rest of the parse *or*
 *   wipe out a previously-stored doc for this node — the storage layer
 *   preserves the last-known-good `jsdoc` value whenever it sees this flag
 *   instead of overwriting it with nothing.
 */
export function extractJsDoc(node) {
  const buildSnippet = node.doc && SNIPPETS[node.kind];
  if (!buildSnippet) return { jsdoc: '' };
  try {
    const source = buildSnippet({ ...node, commentBlock: toCommentBlock(node.doc) });
    const converted = convertBrighterscriptDocs(source, 'BrighterScript', '');
    return { jsdoc: JSDOC_BLOCK.exec(converted)?.[0] ?? '' };
  } catch (err) {
    console.error(`[jsdoc.extract] failed for ${node.kind} "${node.name}" (${node.qualifiedName ?? 'unknown'}): ${err.message}`);
    return { jsdocError: true };
  }
}
