/**
 * sdk-to-ebnf.mjs
 *
 * Generates EBNF-style type definitions from the Roku SDK graph:
 *   - ro* component names (for use in CreateObject strings)
 *   - if* interface method signatures
 *   - SceneGraph node names and their fields
 *
 * These are emitted as EBNF "type grammar" rules that describe the SDK's
 * type system — not runtime syntax, but the valid names and signatures.
 */

import { buildRokuSdkGraph } from '../roku-sdk-graph.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrap(label, items, indent = '  ') {
  if (!items.length) return `${label} ::= (** empty **) ;`;
  const first = items[0];
  const rest  = items.slice(1).map(i => `${indent}| "${i}"`);
  return [`${label.padEnd(36)}::= "${first}"`, ...rest].join('\n') + ' ;';
}

function sanitize(s) {
  // Escape or truncate any value unsafe for EBNF terminal display
  return String(s || '').replace(/["\n]/g, '_').slice(0, 60);
}

// ── Section builders ──────────────────────────────────────────────────────────

function buildComponentNames(nodes) {
  const names = nodes
    .filter(n => n.type === 'Node' && !n.deprecated)
    .map(n => n.label)
    .sort();
  return wrap('ro_component', names);
}

function buildInterfaceNames(nodes) {
  const names = nodes
    .filter(n => n.type === 'interface' && !n.deprecated)
    .map(n => n.label)
    .sort();
  return wrap('interface_name', names);
}

function buildSgNodeNames(nodes) {
  const names = nodes
    .filter(n => n.type === 'roSGNode')
    .map(n => n.label)
    .sort();
  return wrap('scenegraph_node_type', names);
}

function buildInterfaceMethods(nodes, links) {
  const methodsByInterface = {};
  for (const link of links) {
    if (link.relation !== 'has_method') continue;
    const ifNode = nodes.find(n => n.id === link.source && n.type === 'interface');
    if (!ifNode) continue;
    const fnNode = nodes.find(n => n.id === link.target && n.type === 'function');
    if (!fnNode) continue;
    if (!methodsByInterface[ifNode.label]) methodsByInterface[ifNode.label] = [];
    methodsByInterface[ifNode.label].push(fnNode);
  }

  const lines = [];
  for (const [ifName, methods] of Object.entries(methodsByInterface).sort()) {
    const lhs = ifName.padEnd(36);
    const sigs = methods
      .map(m => `"${sanitize(m.signature)}"`)
      .join('\n    | ');
    lines.push(`${lhs}::= ${sigs} ;`);
  }
  return lines.join('\n\n');
}

function buildNodeFields(nodes, links) {
  const fieldsByNode = {};
  for (const link of links) {
    if (link.relation !== 'has_field') continue;
    const sgNode = nodes.find(n => n.id === link.source && n.type === 'roSGNode');
    if (!sgNode) continue;
    const fNode = nodes.find(n => n.id === link.target && n.type === 'field');
    if (!fNode) continue;
    if (!fieldsByNode[sgNode.label]) fieldsByNode[sgNode.label] = [];
    fieldsByNode[sgNode.label].push(fNode);
  }

  const lines = [];
  for (const [nodeName, fields] of Object.entries(fieldsByNode).sort()) {
    const lhs = `${nodeName}_field`.padEnd(36);
    const names = fields
      .map(f => {
        const type = f.fieldType ? ` (* ${sanitize(f.fieldType)} *)` : '';
        return `"${sanitize(f.label)}"${type}`;
      })
      .join('\n    | ');
    lines.push(`${lhs}::= ${names} ;`);
  }
  return lines.join('\n\n');
}

// ── Public API ────────────────────────────────────────────────────────────────

export function sdkToEbnf(sdkDocsPath) {
  const raw = buildRokuSdkGraph(sdkDocsPath);
  const { nodes, links } = raw;

  const lines = [];

  lines.push(`(* ═══════════════════════════════════════════════════════════════`);
  lines.push(`   Roku SDK Type Grammar — EBNF`);
  lines.push(`   Derived from Roku SDK documentation`);
  lines.push(`   Describes valid SDK type names, interface methods, and node fields`);
  lines.push(`   ═══════════════════════════════════════════════════════════════ *)`);
  lines.push('');

  lines.push(`(* ─── BrightScript Component Types ────────────────────────────── *)`);
  lines.push('');
  lines.push(buildComponentNames(nodes));
  lines.push('');

  lines.push(`(* ─── BrightScript Interface Names ────────────────────────────── *)`);
  lines.push('');
  lines.push(buildInterfaceNames(nodes));
  lines.push('');

  lines.push(`(* ─── SceneGraph Node Types ────────────────────────────────────── *)`);
  lines.push('');
  lines.push(buildSgNodeNames(nodes));
  lines.push('');

  lines.push(`(* ─── Interface Method Signatures ─────────────────────────────── *)`);
  lines.push(`(* Each rule lists the valid method call signatures for that interface *)`);
  lines.push('');
  lines.push(buildInterfaceMethods(nodes, links));
  lines.push('');

  lines.push(`(* ─── SceneGraph Node Fields ───────────────────────────────────── *)`);
  lines.push(`(* Each rule lists the valid field names for that node type *)`);
  lines.push('');
  lines.push(buildNodeFields(nodes, links));
  lines.push('');

  return lines.join('\n');
}
