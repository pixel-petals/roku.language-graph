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
import { umlLabelText, umlNodeSize, umlSectionAtFraction } from './viewer.uml-layout.mjs';
import './viewer.stats.mjs';

// Dark-surface-validated (see dataviz skill's references/palette.md): the
// project's chart surface is #1a1a19, chrome/ink below is that surface's
// dark-mode column, not eyeballed.
const EDGE_TIER_STYLE = {
  DECLARED: { stroke: '#898781', lineDash: null }, // muted ink
  RESOLVED: { stroke: '#3987e5', lineDash: null }, // categorical slot 1 (blue)
  TEXTUAL: { stroke: '#c98500', lineDash: [4, 2] }, // categorical slot 4 (yellow), dashed for "less certain"
};

// Categorical slots 1-8, dark column, in the validated fixed order (worst
// adjacent CVD ΔE 8.4, worst adjacent normal-vision ΔE 19.3 — both clear
// the gates for this graph's node-kind count).
const NODE_PALETTE_DARK = ['#3987e5', '#008300', '#d55181', '#c98500', '#199e70', '#d95926', '#9085e9', '#e66767'];

const DARK_SURFACE = '#1a1a19';
const DARK_INK = '#ffffff';
const DARK_INK_MUTED = '#c3c2b7';
const DARK_BORDER = 'rgba(255,255,255,0.15)';

// UML edges (the "Build UML Classes" editor node's output — see
// editor.uml.mjs) carry a relation kind instead of a confidenceTier, styled
// per UML convention: relationship *shape* (arrowhead/dash) carries the
// meaning, not hue — real UML diagrams don't color-code relationship lines.
const UML_RELATION_STYLE = {
  INHERITANCE: { stroke: DARK_INK_MUTED, lineDash: null, endArrow: true, endArrowType: 'triangle', endArrowFill: DARK_SURFACE, startArrow: false },
  COMPOSITION: { stroke: DARK_INK_MUTED, lineDash: null, endArrow: false, startArrow: true, startArrowType: 'diamond', startArrowFill: DARK_INK_MUTED },
  DEPENDENCY: { stroke: DARK_INK_MUTED, lineDash: [4, 2], endArrow: true, endArrowType: 'vee', endArrowFill: DARK_INK_MUTED, startArrow: false },
  ASSOCIATION: { stroke: DARK_INK_MUTED, lineDash: null, endArrow: true, endArrowType: 'vee', endArrowFill: DARK_INK_MUTED, startArrow: false },
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

  // Per-node fold overrides on top of the "Build UML Classes" editor node's
  // graph-wide section toggles (id -> {fields?, publicMethods?,
  // privateMethods?}) — lets one box's Private Functions stay expanded
  // while every other box follows the global default. Reset on every
  // pipeline re-run (a fresh #applyGraphData gets a fresh graphData object,
  // so old node ids' overrides simply go unused) rather than threaded
  // through — a brand-new render is a legitimate point to fall back to the
  // editor node's own settings.
  #foldOverrides = new Map();

  #visibilityFor(d) {
    return { ...d.data.sectionVisibility, ...this.#foldOverrides.get(d.id) };
  }

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
    // UML class boxes run 130-300px tall/wide (see umlNodeSize) vs a plain
    // node's fixed 24px circle — force layout's default spacing assumes the
    // latter, so UML boxes need a much larger collision/link distance or
    // they render stacked on top of each other (reproduced directly: the
    // default spacing left boxes overlapping until this was widened).
    const isUml = graphData.nodes.some(n => n.data.members);
    this.#g6Graph?.destroy();
    this.#g6Graph = new Graph({
      container,
      autoFit: 'view',
      data: graphData,
      node: {
        // A node with `members` came through the "Build UML Classes" editor
        // node (editor.uml.mjs) — render it as a UML class box (a `rect`
        // sized/labeled to its member count) instead of the default circle.
        type: d => (d.data.members ? 'rect' : 'circle'),
        style: {
          size: d => (d.data.members ? umlNodeSize(d.data, this.#visibilityFor(d)) : 24),
          labelText: d => (d.data.members ? umlLabelText(d.data, this.#visibilityFor(d)) : d.data.name),
          // G6's own default is labelPlacement: 'bottom' — a label rendered
          // *below* the key shape, not inside it (fine for a small circle's
          // name tag, but it left a UML box's text floating away from its
          // own rectangle entirely). 'center' anchors the label to the key
          // shape's own bounds instead.
          labelPlacement: d => (d.data.members ? 'center' : 'bottom'),
          labelFontSize: 10,
          labelFontFamily: 'monospace',
          labelTextAlign: d => (d.data.members ? 'left' : 'center'),
          labelFill: DARK_INK,
          // Not `fill`/`stroke`: G6's per-datum style callbacks are merged
          // via Object.assign *after* the palette's computed fill (see
          // @antv/g6's runtime/element.js ElementController), so a callback
          // that returns `undefined` for the non-UML branch would still win
          // the merge and blank out the palette color entirely — verified
          // by reading that merge order directly, not assumed. fillOpacity
          // is never touched by the palette, so it's safe to override only
          // for UML boxes (a lightly-tinted panel instead of a solid-color
          // circle) without that risk.
          fillOpacity: d => (d.data.members ? 0.18 : 1),
        },
        palette: { type: 'group', field: graphData.paletteField || 'kind', color: NODE_PALETTE_DARK },
      },
      edge: {
        style: {
          stroke: d => UML_RELATION_STYLE[d.data.kind]?.stroke ?? (EDGE_TIER_STYLE[d.data.confidenceTier] || EDGE_TIER_STYLE.DECLARED).stroke,
          lineDash: d => UML_RELATION_STYLE[d.data.kind]?.lineDash ?? (EDGE_TIER_STYLE[d.data.confidenceTier] || EDGE_TIER_STYLE.DECLARED).lineDash,
          endArrow: d => UML_RELATION_STYLE[d.data.kind]?.endArrow ?? true,
          startArrow: d => UML_RELATION_STYLE[d.data.kind]?.startArrow ?? false,
          // Same undefined-clobbers-the-default risk as node fill/stroke
          // above (verified in base-edge.js's getArrowStyle: the arrow's
          // own style is the last Object.assign spread, so an explicit
          // `undefined` here would blank the arrowhead's fill/shape instead
          // of falling back) — every branch gets a real value matching this
          // edge type's prior un-styled default ('vee' chevron filled with
          // the edge's own stroke color) rather than risking that.
          endArrowType: d => UML_RELATION_STYLE[d.data.kind]?.endArrowType ?? 'vee',
          endArrowFill: d => UML_RELATION_STYLE[d.data.kind]?.endArrowFill ?? (EDGE_TIER_STYLE[d.data.confidenceTier] || EDGE_TIER_STYLE.DECLARED).stroke,
          startArrowType: d => UML_RELATION_STYLE[d.data.kind]?.startArrowType ?? 'vee',
          startArrowFill: d => UML_RELATION_STYLE[d.data.kind]?.startArrowFill ?? (EDGE_TIER_STYLE[d.data.confidenceTier] || EDGE_TIER_STYLE.DECLARED).stroke,
        },
      },
      combo: {
        style: {
          labelText: d => d.data.label,
          labelFontSize: 11,
          labelFill: DARK_INK_MUTED,
          fill: 'rgba(255,255,255,0.04)',
          stroke: DARK_BORDER,
        },
      },
      layout: {
        type: 'combo-combined',
        comboPadding: 20,
        comboSpacing: 40,
        layout: comboId => ({
          type: 'force',
          preventOverlap: true,
          nodeSize: isUml ? 320 : 24,
          linkDistance: comboId ? 40 : (isUml ? 360 : 80),
        }),
      },
      behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element', 'click-select', 'hover-activate', 'collapse-expand'],
      plugins: [
        {
          type: 'legend',
          nodeField: graphData.paletteField || 'kind',
          position: 'bottom',
          containerStyle: { background: DARK_SURFACE, color: DARK_INK },
        },
        {
          type: 'tooltip',
          getContent: (event, items) => items.map(d => {
            const isEdge = 'source' in d;
            const body = isEdge
              ? `<b>${d.data.kind}</b><br>${d.source} → ${d.target}<br>${d.data.filePath}:${d.data.line}<br>${d.data.confidenceTier} (${d.data.confidence})`
              : `<b>${d.data.name}</b> (${d.data.kind})<br>${d.data.filePath}:${d.data.lineStart}-${d.data.lineEnd}<br><code>${d.id}</code>`;
            return `<div style="background:${DARK_SURFACE}; color:${DARK_INK}; border:1px solid ${DARK_BORDER}; border-radius:4px; padding:6px 8px; font-size:12px;">${body}</div>`;
          }).join(''),
        },
      ],
    });
    await this.#g6Graph.render();
    this.#g6Graph.on('node:click', (e) => this.#onUmlNodeClick(e));
  }

  /**
   * A click on a UML class box's section header (or its member list) folds
   * or unfolds that section for *this node only*, layered on top of the
   * editor node's graph-wide default (see #foldOverrides). `getElementRenderBounds`
   * and the click event's own coordinates turned out to live in two
   * different coordinate spaces (world/layout units vs. on-screen pixels;
   * `getViewportByCanvas` converts between them) — found by logging both
   * and comparing, not assumed from the method names alone. Using the
   * *fraction* of the way down the box's own rendered height sidesteps ever
   * needing to know the current zoom scale explicitly.
   */
  #onUmlNodeClick(e) {
    const id = e.target?.id;
    if (!id) return;
    const datum = this.#g6Graph.getNodeData(id);
    if (!datum?.data?.members) return;

    const bbox = this.#g6Graph.getElementRenderBounds(id);
    // getViewportByCanvas returns a plain [x, y, z] tuple (unlike the click
    // event's own `viewport`, which is an {x, y} object — verified by
    // logging both rather than assumed from one matching the other).
    const [, viewportMinY] = this.#g6Graph.getViewportByCanvas(bbox.min);
    const [, viewportMaxY] = this.#g6Graph.getViewportByCanvas(bbox.max);
    const fraction = (e.viewport.y - viewportMinY) / (viewportMaxY - viewportMinY);
    if (fraction < 0 || fraction > 1) return;

    const visibility = this.#visibilityFor(datum);
    const section = umlSectionAtFraction(datum.data, visibility, fraction);
    if (!section) return;

    this.#foldOverrides.set(id, { ...this.#foldOverrides.get(id), [section]: !visibility[section] });
    // Re-derive this node's own style (size/labelText read #visibilityFor
    // via the node-level style functions already wired in #applyGraphData)
    // rather than a full #applyGraphData rebuild — cheap, and avoids
    // disturbing every other node's current position.
    this.#g6Graph.updateNodeData([{ id }]);
    this.#g6Graph.draw();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this.#resizeDebounce);
    this.#g6Graph?.destroy();
  }

  /** The live G6 Graph instance — for introspection/debugging (e.g. from a devtools console), not needed by other components. */
  get g6Graph() {
    return this.#g6Graph;
  }
}
customElements.define('db-graph-canvas', DbGraphCanvas);
