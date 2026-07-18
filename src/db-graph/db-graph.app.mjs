/**
 * db-graph.app.mjs — composition root.
 *
 * The only file allowed top-level executing code (see CLAUDE.md's
 * "Frontend organization" section): index.html loads this directly, and
 * this is where custom elements get defined and composed. Every other
 * module in src/db-graph exports functions/classes and does nothing
 * behavioral on import.
 *
 * Hydration support must be imported before `lit` itself — see
 * @lit-labs/ssr's README and the lit-app-structure skill.
 */
import '@lit-labs/ssr-client/lit-element-hydrate-support.js';
import 'urlpattern-polyfill';
import { LitElement, html, css } from 'lit';
import { ContextProvider } from '@lit/context';
// Importing from the package root pulls in Router too, which touches
// `location` at module top level and crashes under Node/SSR (verified
// directly) — this app only needs the lower-level Routes controller anyway
// (see the comment on currentRoutePath below), so import its own subpath
// and never load router.js at all.
import { Routes } from '@lit-labs/router/routes.js';
import { graphDataContext, graphDataSignal } from './db-graph.state.mjs';
import './viewer/viewer.canvas.mjs';
import './editor/editor.panel.mjs';

/**
 * Reads the seed data db-graph.ssr.mjs embeds next to the SSR-rendered
 * markup; empty when there isn't one — either previewing the built shell
 * directly (no CLI involved), or this constructor running server-side
 * during the SSR pass itself, where `document` isn't a global at all (only
 * `customElements` is shimmed globally; @lit-labs/ssr-dom-shim's DOM
 * classes are consumed by `lit` as local imports, not globalThis patches —
 * verified directly, this doesn't match the DOM-shim README's framing).
 * The SSR pass gets its data from the explicit `.rawData=` binding in
 * db-graph.ssr.mjs's render() call instead.
 */
function readSeedRawData() {
  if (typeof document === 'undefined') return { nodes: [], edges: [] };
  const script = document.getElementById('db-graph-raw-data');
  return script ? JSON.parse(script.textContent) : { nodes: [], edges: [] };
}

/**
 * `#/`, `#/viewer`, `#/editor` — @lit-labs/router's own `Router` class is
 * pathname+pushState based (it installs global click/popstate listeners and
 * calls `goto(location.pathname)`, see its source), which doesn't fit a
 * page that's generated once and often opened via `file://` with no server
 * to own routing. `Routes.goto()` just matches whatever string you hand it
 * against its URLPattern configs, though, so a plain hash listener adapts
 * it to hash-based navigation instead — same route-matching/outlet
 * machinery, different trigger.
 */
function currentRoutePath() {
  return location.hash.slice(1) || '/';
}

class DbGraphApp extends LitElement {
  static properties = {
    rawData: { attribute: false },
    editorWidth: { state: true },
  };

  static styles = css`
    :host { display: flex; width: 100vw; height: 100vh; font-family: system-ui, sans-serif; overflow: hidden; background: #fff; }
    #viewer { flex: 1 1 auto; min-width: 0; position: relative; }
    #viewer.hidden { display: none; }
    #divider {
      flex: 0 0 5px;
      cursor: col-resize;
      background: transparent;
      position: relative;
    }
    #divider:hover, #divider.dragging { background: #5B8FF9; }
    #divider.inactive { display: none; }
  `;

  // Min/max keep the editor panel from being dragged to something too
  // cramped to use (a LiteGraph canvas needs real room) or so wide it
  // swallows the viewer entirely.
  #MIN_WIDTH = 240;
  #MAX_WIDTH_RATIO = 0.75;

  constructor() {
    super();
    // Property bindings only affect SSR's *output* — the input value itself
    // is never serialized into the page, so the client re-reads it from a
    // JSON script tag db-graph.ssr.mjs embeds alongside the rendered markup
    // (falls back to empty when opened without going through the CLI, e.g.
    // previewing the built shell directly).
    this.rawData = readSeedRawData();
    this.editorWidth = 440;
    new ContextProvider(this, { context: graphDataContext, initialValue: graphDataSignal.get() });
    this._routes = new Routes(this, [
      { path: '/viewer', render: () => 'viewer' },
      { path: '/editor', render: () => 'editor' },
      { path: '/', render: () => 'split' },
    ], { fallback: { render: () => 'split' } });
    this.addEventListener('toggle-collapse', this.#onToggleCollapse);
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('hashchange', this.#onHashChange);
    this._routes.goto(currentRoutePath());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('hashchange', this.#onHashChange);
  }

  render() {
    // outlet() is undefined until goto() has run once, which only happens
    // client-side (connectedCallback doesn't fire under SSR) — 'split' is
    // also the correct SSR-time default.
    const mode = this._routes.outlet() ?? 'split';
    return html`
      <div id="viewer" class=${mode === 'editor' ? 'hidden' : ''}><db-graph-canvas></db-graph-canvas></div>
      <div id="divider" class=${mode === 'split' ? '' : 'inactive'} @pointerdown=${this.#onDividerPointerDown}></div>
      <db-graph-editor-panel .rawData=${this.rawData} .width=${this.editorWidth} .collapsed=${mode === 'viewer'} .full=${mode === 'editor'}></db-graph-editor-panel>
    `;
  }

  #onHashChange = () => this._routes.goto(currentRoutePath());

  #onToggleCollapse = () => {
    location.hash = currentRoutePath() === '/viewer' ? '/' : '/viewer';
  };

  #onDividerPointerDown = (event) => {
    if (currentRoutePath() !== '/') return; // only draggable in split mode
    event.preventDefault();
    const divider = event.currentTarget;
    const startX = event.clientX;
    const startWidth = this.editorWidth;
    divider.classList.add('dragging');
    divider.setPointerCapture(event.pointerId);

    const onMove = (moveEvent) => {
      const maxWidth = window.innerWidth * this.#MAX_WIDTH_RATIO;
      const proposed = startWidth - (moveEvent.clientX - startX);
      this.editorWidth = Math.min(maxWidth, Math.max(this.#MIN_WIDTH, proposed));
    };
    const onUp = () => {
      divider.classList.remove('dragging');
      divider.removeEventListener('pointermove', onMove);
      divider.removeEventListener('pointerup', onUp);
    };
    divider.addEventListener('pointermove', onMove);
    divider.addEventListener('pointerup', onUp);
  };
}
customElements.define('db-graph-app', DbGraphApp);
