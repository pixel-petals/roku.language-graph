/**
 * graph-ml.transform.mjs
 *
 * Renders a graphology graph as GraphML XML, matching the schema a prior
 * @sentropic/graphify run produced (see examples/exports/bsc-plugin/graph.graphml):
 * `kind`/`file`/`language`/`community` keys on nodes, `kind` on edges. Pure
 * function — no existing implementation to delegate to, so this is
 * hand-rolled (fixed, well-understood format, no dependency warranted).
 */

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function dataTag(key, value) {
  return value == null ? '' : `      <data key="${key}">${escapeXml(value)}</data>\n`;
}

function nodeTag(id, attrs) {
  let xml = `    <node id="${escapeXml(id)}">\n`;
  xml += dataTag('kind', attrs.type);
  xml += dataTag('file', attrs.filePath);
  xml += dataTag('language', attrs.language);
  xml += dataTag('community', attrs.community);
  xml += '    </node>\n';
  return xml;
}

function edgeTag(source, target, attrs) {
  let xml = `    <edge source="${escapeXml(source)}" target="${escapeXml(target)}">\n`;
  xml += dataTag('edge_kind', attrs.relation);
  xml += '    </edge>\n';
  return xml;
}

/** Render a graphology graph as a GraphML XML string. */
export function toGraphMl(graph) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<graphml xmlns="http://graphml.graphstruct.org/graphml"\n';
  xml += '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n';
  xml += '  xsi:schemaLocation="http://graphml.graphstruct.org/graphml">\n';
  xml += '  <key id="kind" for="node" attr.name="kind" attr.type="string"/>\n';
  xml += '  <key id="file" for="node" attr.name="file" attr.type="string"/>\n';
  xml += '  <key id="language" for="node" attr.name="language" attr.type="string"/>\n';
  xml += '  <key id="community" for="node" attr.name="community" attr.type="int"/>\n';
  xml += '  <key id="edge_kind" for="edge" attr.name="kind" attr.type="string"/>\n';
  xml += '  <graph id="roku-graphify" edgedefault="directed">\n';
  graph.forEachNode((id, attrs) => { xml += nodeTag(id, attrs); });
  graph.forEachEdge((_edge, attrs, source, target) => { xml += edgeTag(source, target, attrs); });
  xml += '  </graph>\n';
  xml += '</graphml>\n';
  return xml;
}
