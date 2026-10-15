import path from 'path';

/**
 * Adapt roku-sdk.graph.mjs's buildRokuSdkGraph() {nodes, links} shape into
 * the {nodes, edges} record shape src/db's GraphStore expects — the same
 * shape src/parse/roku-app produces, so both parsers can share one store.
 */
export function toGraphRecords(raw) {
  const source = raw.graph.source;

  // function nodes' real owner (ro:/if: OR sg:) — from the has_method edge
  // that created them, not guessed. Previously this always assumed an
  // `if:` prefix, which was wrong for methods owned by `ro:` components.
  const methodOwnerById = {};
  for (const link of raw.links) {
    if (link.relation === 'has_method') methodOwnerById[link.target] = link.source;
  }

  const nodes = raw.nodes.map(n => ({
    kind: n.type,
    name: n.label,
    qualifiedName: n.id,
    filePath: n.docFile ? path.join(source, n.docFile) : source,
    lineStart: null,
    lineEnd: null,
    language: 'roku-sdk',
    parentName: n.type === 'function' ? (methodOwnerById[n.id] ?? null) : (n.owner ? `sg:${n.owner}` : null),
    params: n.params ?? null,
    returnType: n.returnType ?? n.fieldType ?? null,
    modifiers: null,
    isTest: false,
    fileHash: null,
    extra: {
      deprecated: n.deprecated ?? false, category: n.category ?? null, description: n.description ?? null,
      signature: n.signature ?? null, defaultValue: n.defaultValue ?? null, access: n.access ?? null,
    },
  }));

  const edges = raw.links.map(l => ({
    kind: l.relation.toUpperCase(),
    sourceQualified: l.source,
    targetQualified: l.target,
    filePath: source,
    line: 0,
    extra: {},
    confidence: 1.0,
    confidenceTier: 'DECLARED',
  }));

  return { nodes, edges };
}

/** SceneGraph (roSGNode types + their fields) vs BrightScript (core ro-prefixed/if-prefixed language objects) — by qualifiedName prefix, or a function node's real owner. */
export function categorize(qualifiedName, parentName) {
  const prefix = qualifiedName.split(':')[0];
  if (prefix === 'sg' || prefix === 'field') return 'sceneGraph';
  if (prefix === 'ro' || prefix === 'if') return 'brightScript';
  if (prefix === 'fn') return parentName?.startsWith('sg:') ? 'sceneGraph' : 'brightScript';
  return 'brightScript'; // dangling/unknown stub nodes — default rather than drop
}

/** Split toGraphRecords()' output into SceneGraph and BrightScript subsets — same schema, two logical databases (see cli.generate-sdk-exports.mjs). */
export function partitionRecords(nodes, edges) {
  const categoryByQname = new Map(nodes.map(n => [n.qualifiedName, categorize(n.qualifiedName, n.parentName)]));

  const sceneGraph = { nodes: [], edges: [] };
  const brightScript = { nodes: [], edges: [] };
  const bucket = { sceneGraph, brightScript };

  for (const n of nodes) bucket[categoryByQname.get(n.qualifiedName)].nodes.push(n);
  for (const e of edges) {
    const category = categoryByQname.get(e.sourceQualified) ?? 'brightScript';
    bucket[category].edges.push(e);
  }

  return { sceneGraph, brightScript };
}
