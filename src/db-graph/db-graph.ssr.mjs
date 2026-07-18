/**
 * db-graph.ssr.mjs
 *
 * Node-only: renders <db-graph-app> (seeded with a specific GraphStore's
 * data) to an HTML string via @lit-labs/ssr, and splices it into the
 * Vite-built shell (see db-graph.vite.config.mjs) in place of the shell's
 * empty <db-graph-app></db-graph-app> placeholder.
 *
 * SSR only pre-renders the app shell — panel structure, the stats readout's
 * real initial counts — not the G6/LiteGraph canvas pixels themselves.
 * Neither `firstUpdated`/`updated` (where the canvas libraries get
 * constructed) run under @lit-labs/ssr by design (only the constructor,
 * `willUpdate`, and `render()` do), so this is safe by construction, not by
 * convention — verified directly, not assumed (see CLAUDE.md's
 * verification-discipline rule).
 */
import { readFile } from 'fs/promises';
import { render } from '@lit-labs/ssr';
import { collectResult } from '@lit-labs/ssr/lib/render-result.js';
import { html } from 'lit';
import './db-graph.app.mjs';

const PLACEHOLDER = '<db-graph-app></db-graph-app>';

/**
 * @param {{nodes: object[], edges: object[]}} rawData a GraphStore's queryAll() result
 * @param {{shellPath: string, title?: string}} options
 */
export async function renderApp(rawData, { shellPath, title = 'db-graph' }) {
  const rendered = render(html`<db-graph-app .rawData=${rawData}></db-graph-app>`);
  const appHtml = await collectResult(rendered);

  const shell = await readFile(shellPath, 'utf8');
  if (!shell.includes(PLACEHOLDER)) {
    throw new Error(`db-graph.ssr: built shell at ${shellPath} is missing the ${PLACEHOLDER} placeholder — was it built from a stale index.html?`);
  }
  // Property bindings (`.rawData=`) only affect the *rendered output* — SSR
  // never serializes the input value itself into the page, so the client's
  // fresh module evaluation has no way to know what data produced this
  // markup unless we hand it over explicitly. DbGraphApp's constructor
  // reads this same element back out (see db-graph.app.mjs).
  const dataScript = `<script type="application/json" id="db-graph-raw-data">${serializeForScriptTag(rawData)}</script>`;

  return shell
    .replace(PLACEHOLDER, `${dataScript}\n${appHtml}`)
    .replace(/<title>.*<\/title>/, `<title>${escapeHtml(title)}</title>`);
}

/** JSON.stringify, escaped so a literal `</script>` in string data can't end the tag early. */
function serializeForScriptTag(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
