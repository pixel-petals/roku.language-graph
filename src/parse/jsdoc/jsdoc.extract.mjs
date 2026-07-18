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
 * Best-effort JSDoc block for one declaration. `node.doc` is the raw
 * comment text already collected by `docCommentFor` — falls straight
 * through to `''` when there's no comment or no snippet template for
 * `node.kind`. Any failure past that (parser choking on the synthesized
 * snippet, unexpected plugin output shape) also falls back to `''` — a bad
 * jsdoc run must never break the rest of the parse.
 */
export function extractJsDoc(node) {
  const buildSnippet = node.doc && SNIPPETS[node.kind];
  if (!buildSnippet) return '';
  try {
    const source = buildSnippet({ ...node, commentBlock: toCommentBlock(node.doc) });
    const converted = convertBrighterscriptDocs(source, 'BrighterScript', '');
    return JSDOC_BLOCK.exec(converted)?.[0] ?? '';
  } catch {
    return '';
  }
}
