/**
 * xml.transform.mjs
 *
 * Renders a graphology graph as a generic XML dump of every node/edge
 * attribute — deliberately simpler/less structured than graph-ml.transform.mjs,
 * which matches a real fixed GraphML schema. Pure function — no existing
 * implementation to delegate to, so this is hand-rolled.
 */

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function attrsToXml(attrs, indent) {
  return Object.entries(attrs)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${indent}<${k}>${escapeXml(v)}</${k}>`)
    .join('\n');
}

/** Render a graphology graph as a generic XML string. */
export function toXml(graph) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<graph>', '  <nodes>'];
  graph.forEachNode((id, attrs) => {
    lines.push(`    <node id="${escapeXml(id)}">`);
    lines.push(attrsToXml(attrs, '      '));
    lines.push('    </node>');
  });
  lines.push('  </nodes>', '  <edges>');
  graph.forEachEdge((_edge, attrs, source, target) => {
    lines.push(`    <edge source="${escapeXml(source)}" target="${escapeXml(target)}">`);
    lines.push(attrsToXml(attrs, '      '));
    lines.push('    </edge>');
  });
  lines.push('  </edges>', '</graph>');
  return lines.join('\n') + '\n';
}
