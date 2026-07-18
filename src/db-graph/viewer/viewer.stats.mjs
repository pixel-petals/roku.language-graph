/**
 * viewer.stats.mjs
 *
 * <db-graph-stats> — small node/edge/group-count readout, positioned over
 * the graph canvas. Takes graphData as a plain property from its parent
 * (<db-graph-canvas>, a direct parent-child relationship) rather than
 * subscribing to graphDataSignal itself: per the lit-app-structure skill,
 * @lit/context/signals are for data that needs to reach a component more
 * than one layer down, not a direct child.
 *
 * Renders the whole readout as a single interpolated string
 * (`${text}`, one lit-html part) rather than several adjacent parts
 * (`${a}${b}${c}`) — found, by reproducing it directly, that an
 * SSR-hydrated multi-part template whose LAST part is an empty string at
 * SSR time (no combos yet — the editor pipeline hasn't run server-side,
 * see db-graph.ssr.mjs) never properly hydrates that part: the property
 * updates correctly afterward (confirmed via the live DOM property) but
 * the corresponding text silently never appears, with no console error.
 * Not documented behavior of @lit-labs/ssr — an experimental package's
 * genuine rough edge, not something to route around indefinitely; revisit
 * if a newer @lit-labs/ssr fixes empty-string part hydration.
 */
import { LitElement, html, css } from 'lit';

export class DbGraphStats extends LitElement {
  static properties = {
    graphData: { attribute: false },
  };

  static styles = css`
    :host {
      position: absolute;
      top: 8px;
      left: 8px;
      background: rgba(255, 255, 255, 0.9);
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 12px;
      font-family: system-ui, sans-serif;
      color: #333;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
    }
  `;

  constructor() {
    super();
    this.graphData = { nodes: [], edges: [], combos: [] };
  }

  render() {
    const { nodes, edges, combos } = this.graphData;
    const text = `${nodes.length} nodes / ${edges.length} edges` + (combos.length > 0 ? ` / ${combos.length} groups` : '');
    return html`${text}`;
  }
}
customElements.define('db-graph-stats', DbGraphStats);
