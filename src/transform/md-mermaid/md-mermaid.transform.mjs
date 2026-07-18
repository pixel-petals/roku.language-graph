/**
 * md-mermaid.transform.mjs
 *
 * Renders a graphology graph as Markdown with embedded Mermaid flowcharts —
 * one block per community (falls back to a single block if no `community`
 * node attribute is present). Pure function — no existing implementation to
 * delegate to, so this is hand-rolled.
 */

/** Assigns each real node ID a short, guaranteed-unique mermaid-safe ID (n0, n1, ...). */
function makeIdMap(graph) {
  const map = new Map();
  let i = 0;
  graph.forEachNode((id) => map.set(id, `n${i++}`));
  return map;
}

function escapeLabel(value) {
  return String(value ?? '').replace(/"/g, "'").replace(/\n/g, ' ');
}

function flowchartFor(graph, nodeIds, idMap) {
  const idSet = new Set(nodeIds);
  const lines = ['```mermaid', 'flowchart TD'];
  for (const id of nodeIds) {
    const attrs = graph.getNodeAttributes(id);
    lines.push(`  ${idMap.get(id)}["${escapeLabel(attrs.label ?? id)}"]`);
  }
  graph.forEachEdge((_edge, attrs, source, target) => {
    if (!idSet.has(source) || !idSet.has(target)) return;
    const label = attrs.relation ? `|${escapeLabel(attrs.relation)}|` : '';
    lines.push(`  ${idMap.get(source)} -->${label} ${idMap.get(target)}`);
  });
  lines.push('```');
  return lines.join('\n');
}

function groupByCommunity(graph) {
  const groups = new Map();
  graph.forEachNode((id, attrs) => {
    const key = attrs.community ?? 'all';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(id);
  });
  return groups;
}

/** Render a graphology graph as Markdown with one Mermaid flowchart per community. */
export function toMermaidMarkdown(graph) {
  const groups = groupByCommunity(graph);
  const idMap = makeIdMap(graph);
  const sections = [];
  for (const [community, nodeIds] of groups) {
    const heading = community === 'all' ? '## Graph' : `## Community ${community}`;
    sections.push(`${heading}\n\n${flowchartFor(graph, nodeIds, idMap)}`);
  }
  return sections.join('\n\n') + '\n';
}
