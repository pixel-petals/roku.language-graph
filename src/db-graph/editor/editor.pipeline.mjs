/**
 * editor.pipeline.mjs
 *
 * Pure functions behind the node-editor's Filter Nodes/Filter Edges node
 * types (see editor.node-types.mjs). Split out from the LiteGraph wiring
 * so this logic is unit-testable without a canvas/DOM.
 */
import { dirname } from '../db-graph.data.mjs';

export const NODE_FIELDS = ['kind', 'name', 'language', 'parentName', 'folder', 'filePath'];
export const EDGE_FIELDS = ['kind', 'confidenceTier', 'filePath'];
export const CLUSTER_FIELDS = ['folder', 'kind', 'parentName', 'language', '(none)'];
export const OPERATORS = ['is one of', 'is not one of', 'is', 'is not', 'contains'];

export function fieldValueOf(record, field) {
  return field === 'folder' ? dirname(record.filePath || '') : record[field];
}

export function matchesFilter(record, field, operator, values) {
  if (!values.length) return true;
  const v = fieldValueOf(record, field);
  switch (operator) {
    case 'is': return v === values[0];
    case 'is not': return v !== values[0];
    case 'is one of': return values.includes(v);
    case 'is not one of': return !values.includes(v);
    case 'contains': return String(v ?? '').includes(values[0]);
    default: return true;
  }
}

export function valueOptionsFor(records, field) {
  const counts = new Map();
  for (const r of records) {
    const v = fieldValueOf(r, field);
    if (v === undefined || v === null || v === '') continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
}

export function summarizeValues(values) {
  if (!values.length) return '(any)';
  if (values.length <= 2) return values.join(', ');
  return `${values.slice(0, 2).join(', ')} (+${values.length - 2})`;
}
