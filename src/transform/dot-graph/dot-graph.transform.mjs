/**
 * dot-graph.transform.mjs
 *
 * Renders a graphology graph as Graphviz DOT text. Pure function — no
 * existing implementation to delegate to, so this is hand-rolled (the
 * format is small and fixed, no dependency warranted).
 */

function escapeDot(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function nodeLine(id, attrs) {
  const label = escapeDot(attrs.label ?? id);
  const kind = escapeDot(attrs.type ?? '');
  const community = attrs.community != null ? `, community="${escapeDot(attrs.community)}"` : '';
  return `  "${escapeDot(id)}" [label="${label}", kind="${kind}"${community}];`;
}

function edgeLine(source, target, attrs) {
  const relation = escapeDot(attrs.relation ?? '');
  return `  "${escapeDot(source)}" -> "${escapeDot(target)}" [relation="${relation}"];`;
}

/** Render a graphology graph as a Graphviz DOT string. */
export function toDot(graph) {
  const lines = ['digraph G {'];
  graph.forEachNode((id, attrs) => lines.push(nodeLine(id, attrs)));
  graph.forEachEdge((_edge, attrs, source, target) => lines.push(edgeLine(source, target, attrs)));
  lines.push('}');
  return lines.join('\n') + '\n';
}
