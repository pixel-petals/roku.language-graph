/**
 * viewer.canvas.mjs
 *
 * <db-graph-canvas> — owns the G6 Graph instance for the whole app. G6 is a
 * real npm import (bundled by Vite) rather than a CDN <script> now that a
 * bundler exists in this project — see CLAUDE.md's "Frontend organization"
 * section for why that's the simpler choice once you're past one or two
 * glued-together UMD libraries.
 *
 * Rebuilds (destroy + recreate) on every pipeline run rather than diffing
 * into the live instance: palette/combo config only take effect at
 * construction, and this graph is small enough (hundreds, not tens of
 * thousands, of nodes) that a rebuild per run is simpler than chasing G6's
 * dynamic-option-update surface for a case this size doesn't need — same
 * reasoning as the pre-Lit implementation, now expressed as a
 * SignalWatcher-driven render() instead of a manually-threaded callback.
 */
import { LitElement, html, css } from 'lit';
import { Graph } from '@antv/g6';
import { SignalWatcher } from '@lit-labs/signals';
import { ResizeController } from '@lit-labs/observers/resize-controller.js';
import { graphDataSignal } from '../db-graph.state.mjs';
import './viewer.stats.mjs';

const EDGE_TIER_STYLE = {
  DECLARED: { stroke: '#8C8C8C', lineDash: null },
  RESOLVED: { stroke: '#5B8FF9', lineDash: null },
  TEXTUAL: { stroke: '#F6BD16', lineDash: [4, 2] },
};

export class DbGraphCanvas extends SignalWatcher(LitElement) {
  static styles = css`
    :host { display: block; position: relative; width: 100%; height: 100%; }
    #container { width: 100%; height: 100%; }
  `;

  #g6Graph = null;
  #latestGraphData = null;
  // G6's Graph.render() is async (it builds its internal viewport/camera/
  // behavior controllers in initRuntime()). Two pipeline runs can land close
  // enough together (e.g. the editor panel's initial pipeline run lands
  // moments after the canvas's own first empty-data pass) that a second
  // #applyGraphData starts before the first graph's render() has finished —
  // destroy()ing it mid-initRuntime() reaches into half-constructed
  // internals and throws ("Cannot read properties of undefined (reading
  // 'getCamera')"), reproduced directly rather than guessed from the stack
  // trace alone. #pending chains every apply/resize through the previous
  // one's completion so a graph is never touched while still initializing.
  #pending = Promise.resolve();

  #resizeDebounce = null;

  constructor() {
    super();
    this._resize = new ResizeController(this, {
      // Debounced: a drag (e.g. the app's editor/viewer split divider)
      // fires this on every intermediate frame, and calling G6's own
      // .resize() that rapidly — faster than G6 settles between calls —
      // corrupts its internal render state (canvas goes blank and stays
      // blank, doesn't self-heal), reproduced directly while building the
      // divider rather than assumed. Only resize once movement pauses.
      callback: () => {
        clearTimeout(this.#resizeDebounce);
        this.#resizeDebounce = setTimeout(() => {
          this.#pending = this.#pending
            .catch(() => {})
            .then(async () => {
              await this.#g6Graph?.resize(this.clientWidth, this.clientHeight);
              // G6's resize() only resizes the canvas layers — it doesn't
              // recompute the viewport, so a large size jump (e.g. the
              // editor panel collapsing to 0 width) leaves the previously
              // fit content clipped/off-camera, reproduced directly by
              // switching straight to the viewer-only route: fitView()
              // after every resize keeps the graph in frame.
              await this.#g6Graph?.fitView();
            });
        }, 120);
      },
    });
  }

  render() {
    // Tracked read: SignalWatcher subscribes because this runs inside render().
    this.#latestGraphData = graphDataSignal.get();
    return html`<div id="container"><db-graph-stats .graphData=${this.#latestGraphData}></db-graph-stats></div>`;
  }

  updated() {
    this.#pending = this.#pending.catch(() => {}).then(() => this.#applyGraphData(this.#latestGraphData));
  }

  async #applyGraphData(graphData) {
    const container = this.renderRoot.querySelector('#container');
    this.#g6Graph?.destroy();
    this.#g6Graph = new Graph({
      container,
      autoFit: 'view',
      data: graphData,
      node: {
        style: { size: 24, labelText: d => d.data.name, labelFontSize: 10 },
        palette: { type: 'group', field: graphData.paletteField || 'kind' },
      },
      edge: {
        style: {
          stroke: d => (EDGE_TIER_STYLE[d.data.confidenceTier] || EDGE_TIER_STYLE.DECLARED).stroke,
          lineDash: d => (EDGE_TIER_STYLE[d.data.confidenceTier] || EDGE_TIER_STYLE.DECLARED).lineDash,
          endArrow: true,
        },
      },
      combo: {
        style: { labelText: d => d.data.label, labelFontSize: 11 },
      },
      layout: {
        type: 'combo-combined',
        comboPadding: 20,
        comboSpacing: 40,
        layout: comboId => ({ type: 'force', preventOverlap: true, linkDistance: comboId ? 40 : 80 }),
      },
      behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element', 'click-select', 'hover-activate', 'collapse-expand'],
      plugins: [
        { type: 'legend', nodeField: graphData.paletteField || 'kind', position: 'bottom' },
        {
          type: 'tooltip',
          getContent: (event, items) => items.map(d => {
            const isEdge = 'source' in d;
            if (isEdge) {
              return `<div><b>${d.data.kind}</b><br>${d.source} → ${d.target}<br>${d.data.filePath}:${d.data.line}<br>${d.data.confidenceTier} (${d.data.confidence})</div>`;
            }
            return `<div><b>${d.data.name}</b> (${d.data.kind})<br>${d.data.filePath}:${d.data.lineStart}-${d.data.lineEnd}<br><code>${d.id}</code></div>`;
          }).join(''),
        },
      ],
    });
    await this.#g6Graph.render();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this.#resizeDebounce);
    this.#g6Graph?.destroy();
  }
}
customElements.define('db-graph-canvas', DbGraphCanvas);
