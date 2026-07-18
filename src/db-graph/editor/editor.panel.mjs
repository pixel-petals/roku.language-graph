/**
 * editor.panel.mjs
 *
 * <db-graph-editor-panel> — hosts the LiteGraph node-editor canvas. Sizes
 * it via @lit-labs/observers' ResizeController (raw <canvas> elements need
 * explicit pixel width/height, unlike G6's container div, so this one
 * genuinely needs it) and animates its collapse/expand via @lit-labs/motion's
 * `animate` directive instead of an instant CSS snap.
 */
import { LitElement, html, css } from 'lit';
import { animate } from '@lit-labs/motion';
import { ResizeController } from '@lit-labs/observers/resize-controller.js';
import { setupPipeline } from './editor.node-types.mjs';
import { graphDataSignal } from '../db-graph.state.mjs';

export class DbGraphEditorPanel extends LitElement {
  static properties = {
    rawData: { attribute: false },
    collapsed: { type: Boolean, reflect: true },
    full: { type: Boolean, reflect: true },
    width: { type: Number },
  };

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 440px;
      border-left: 1px solid #333;
      background: #222;
      overflow: hidden;
    }
    :host([collapsed]) { width: 0; }
    :host([full]) { width: 100%; border-left: none; }
    #header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      color: #ccc;
      font-size: 12px;
      font-family: system-ui, sans-serif;
      background: #2a2a2a;
      border-bottom: 1px solid #333;
      white-space: nowrap;
    }
    canvas { flex: 1 1 auto; width: 100%; }
    button {
      font-size: 12px;
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid #555;
      background: #333;
      color: #ccc;
      cursor: pointer;
    }
  `;

  #pipeline = null;

  constructor() {
    super();
    this.rawData = { nodes: [], edges: [] };
    this.collapsed = false;
    this.full = false;
    this.width = 440;
    this._resize = new ResizeController(this, {
      callback: () => this.#resizeCanvas(),
    });
  }

  render() {
    return html`
      <div id="header" ${animate()}>
        <span>Node Editor — right-click for nodes, drag from a socket to connect</span>
        <button @click=${() => this.dispatchEvent(new CustomEvent('toggle-collapse', { bubbles: true, composed: true }))}>
          ${this.collapsed ? 'Show' : 'Hide'}
        </button>
      </div>
      <canvas ${animate()}></canvas>
    `;
  }

  firstUpdated() {
    const canvasEl = this.renderRoot.querySelector('canvas');
    this.#pipeline = setupPipeline({
      canvasEl,
      rawData: this.rawData,
      onRender: (graphData) => { graphDataSignal.set(graphData); },
    });
    this.#resizeCanvas();
  }

  updated(changed) {
    if (changed.has('collapsed') || changed.has('full') || changed.has('width')) {
      // Inline style beats the :host([collapsed])/:host([full]) attribute
      // rules by CSS specificity, so an explicit width only applies in the
      // normal (split-view) state — collapsed/full stay driven by CSS.
      if (this.collapsed || this.full) this.style.removeProperty('width');
      else this.style.width = `${this.width}px`;
      requestAnimationFrame(() => this.#resizeCanvas());
    }
  }

  #resizeCanvas() {
    const canvasEl = this.renderRoot.querySelector('canvas');
    if (!canvasEl || !this.#pipeline) return;
    canvasEl.width = this.clientWidth;
    canvasEl.height = this.clientHeight - (this.renderRoot.querySelector('#header')?.offsetHeight ?? 0);
    this.#pipeline.canvas.resize(canvasEl.width, canvasEl.height);
    // Resizing a <canvas> element clears its pixel buffer immediately (per
    // spec), and a big width jump (e.g. 0 -> full width switching between
    // route view-modes) can also leave prior content outside the visible
    // area — recenter so a route switch always leaves the graph visible
    // rather than relying on the user to pan/zoom to find it again.
    this.#pipeline.canvas.ds.reset();
    this.#pipeline.canvas.setDirty(true, true);
  }

  /** The LiteGraph { graph, canvas } this panel hosts — for introspection/debugging (e.g. from a devtools console), not needed by other components. */
  get pipeline() {
    return this.#pipeline;
  }
}
customElements.define('db-graph-editor-panel', DbGraphEditorPanel);
