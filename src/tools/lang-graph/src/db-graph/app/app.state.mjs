/**
 * app.state.mjs
 *
 * Shared reactive state for the db-graph app: signals for data that changes
 * over the app's lifetime, and the @lit/context keys used to provide them
 * to descendant components without prop-drilling.
 */

import { createContext } from '@lit/context';
import { signal } from '@lit-labs/signals';

/** Latest { nodes, edges, combos, paletteField } produced by the editor pipeline. */
export const graphDataSignal = signal({ nodes: [], edges: [], combos: [], paletteField: 'kind' });

export const graphDataContext = createContext(Symbol('db-graph.graphData'));
