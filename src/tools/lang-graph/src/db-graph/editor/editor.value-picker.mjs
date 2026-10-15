/**
 * editor.value-picker.mjs
 *
 * <db-graph-value-picker> — tag-cloud autocomplete for a Filter Nodes/Edges
 * widget's `value`: every chip is a value that actually occurs in the
 * pipeline's upstream data at that point (with its occurrence count), never
 * free text, so a filter can't be typo'd against a kind/field that doesn't
 * exist. Positioned by its owner (editor.node-types.mjs) via `x`/`y`
 * properties; closes itself on Escape or an outside click and reports both
 * selection changes and its own closing via events, since LiteGraph node
 * widgets aren't Lit components and can't just bind to a child's property.
 *
 * @fires value-changed - detail: string[] (the new selected-value list)
 * @fires close - no detail; owner should remove this element
 */
import { LitElement, html, css } from 'lit';

export class DbGraphValuePicker extends LitElement {
  static properties = {
    options: { attribute: false }, // {value, count}[]
    selected: { attribute: false }, // string[]
    x: { type: Number },
    y: { type: Number },
    query: { state: true },
  };

  static styles = css`
    :host {
      position: fixed;
      z-index: 1000;
      width: 240px;
      max-height: 280px;
      background: #fff;
      border: 1px solid #ccc;
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
      padding: 8px;
      font-size: 12px;
      font-family: system-ui, sans-serif;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    input {
      font-size: 12px;
      padding: 4px 6px;
      border: 1px solid #ccc;
      border-radius: 4px;
    }
    .cloud {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      overflow-y: auto;
      color: #666;
    }
    .chip {
      border: 1px solid #ccc;
      background: #f4f4f4;
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 11px;
      cursor: pointer;
      color: #333;
    }
    .chip:hover { background: #e8e8e8; }
    .chip.selected { background: #5B8FF9; border-color: #5B8FF9; color: #fff; }
  `;

  constructor() {
    super();
    this.options = [];
    this.selected = [];
    this.x = 0;
    this.y = 0;
    this.query = '';
    this._onDocMouseDown = (e) => { if (!this.contains(e.target)) this.#close(); };
    this._onKeyDown = (e) => { if (e.key === 'Escape') this.#close(); };
  }

  connectedCallback() {
    super.connectedCallback();
    this.style.left = `${Math.min(this.x, window.innerWidth - 260)}px`;
    this.style.top = `${Math.min(this.y, window.innerHeight - 300)}px`;
    // Registered on next tick so the click that opened this picker doesn't immediately close it.
    setTimeout(() => {
      document.addEventListener('mousedown', this._onDocMouseDown, true);
      document.addEventListener('keydown', this._onKeyDown, true);
    }, 0);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('mousedown', this._onDocMouseDown, true);
    document.removeEventListener('keydown', this._onKeyDown, true);
  }

  render() {
    const q = this.query.toLowerCase();
    const visible = this.options.filter(o => !q || String(o.value).toLowerCase().includes(q));
    return html`
      <input
        placeholder="Search ${this.options.length} value${this.options.length === 1 ? '' : 's'}..."
        .value=${this.query}
        @input=${e => { this.query = e.target.value; }}
      />
      <div class="cloud">
        ${visible.length ? visible.map(o => this.#renderChip(o)) : html`(no matching values)`}
      </div>
    `;
  }

  #renderChip({ value, count }) {
    const isSelected = this.selected.includes(value);
    return html`
      <button
        type="button"
        class="chip ${isSelected ? 'selected' : ''}"
        @click=${() => this.#toggle(value)}
      >${value} (${count})</button>
    `;
  }

  #toggle(value) {
    const next = this.selected.includes(value)
      ? this.selected.filter(v => v !== value)
      : [...this.selected, value];
    this.selected = next;
    this.dispatchEvent(new CustomEvent('value-changed', { detail: next }));
  }

  #close() {
    this.dispatchEvent(new CustomEvent('close'));
  }

  firstUpdated() {
    this.renderRoot.querySelector('input')?.focus();
  }
}
customElements.define('db-graph-value-picker', DbGraphValuePicker);
