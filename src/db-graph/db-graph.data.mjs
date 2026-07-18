/**
 * db-graph.data.mjs
 *
 * Converts a GraphStore's queryAll() result ({ nodes, edges } shaped per
 * src/db/db.store.mjs) into the { nodes, edges, combos } shape @antv/g6's
 * Graph constructor expects: nodes keyed by `id`, arbitrary fields under
 * `data`.
 *
 * No `node:path` import, and no other Node-specific dependency — this
 * module's source is inlined verbatim into the generated HTML's <script>
 * (see db-graph.html.mjs) so the viewer's node-based editor (db-graph.editor.mjs)
 * can call the exact same function in the browser instead of duplicating
 * its logic client-side.
 */

/** path.dirname, hand-rolled (no node:path — see file header) */
export function dirname(filePath) {
  const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return idx === -1 ? '.' : filePath.slice(0, idx);
}

/** path.basename, hand-rolled (no node:path — see file header) */
export function basename(filePath) {
  const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return idx === -1 ? filePath : filePath.slice(idx + 1);
}

/** A node field the editor's Cluster/Color nodes can group or color by. `folder` isn't a stored column — it's derived from filePath here. */
export function nodeFieldValue(node, field) {
  return field === 'folder' ? dirname(node.filePath) : node[field];
}

/**
 * @param {{nodes: object[], edges: object[]}} graph
 * @param {{comboField?: string|null}} [options] group nodes into a combo per
 *   distinct value of this field (e.g. 'folder', 'kind'); `null`/omitted for
 *   no combos. Values are read via nodeFieldValue, so 'folder' works even
 *   though it isn't a real column on the stored node.
 */
export function toGraphData({ nodes, edges }, { comboField = null } = {}) {
  const knownIds = new Set(nodes.map(n => n.qualifiedName));
  const combos = new Map();

  const gNodes = nodes.map(n => {
    const combo = comboField ? (nodeFieldValue(n, comboField) ?? '(none)') : undefined;
    if (comboField && !combos.has(combo)) {
      const label = comboField === 'folder' ? basename(combo) : combo;
      combos.set(combo, { id: combo, data: { label } });
    }
    return {
      id: n.qualifiedName,
      combo,
      data: {
        kind: n.kind,
        name: n.name,
        filePath: n.filePath,
        lineStart: n.lineStart,
        lineEnd: n.lineEnd,
        language: n.language,
        parentName: n.parentName,
        folder: dirname(n.filePath),
        // Present only on class-shaped nodes the "Build UML Classes" editor
        // node produces ({fields: string[], methods: string[]}); the viewer
        // switches a node to its UML box rendering when this is set.
        members: n.members,
      },
    };
  });

  return {
    nodes: gNodes,
    combos: [...combos.values()],
    // A dangling edge (source/target not present in this graph's own node
    // set) is real, recurring output shape from the parsers (see CLAUDE.md's
    // "CFG dangling-edge bug" history) — e.g. a CALLS edge into the SDK
    // reference graph when only the app graph was loaded. G6 throws if an
    // edge references an unknown node id, so drop these rather than crash.
    edges: edges
      .filter(e => knownIds.has(e.sourceQualified) && knownIds.has(e.targetQualified))
      .map((e, i) => ({
        id: `e${i}`,
        source: e.sourceQualified,
        target: e.targetQualified,
        data: {
          kind: e.kind,
          filePath: e.filePath,
          line: e.line,
          confidence: e.confidence,
          confidenceTier: e.confidenceTier,
        },
      })),
  };
}
