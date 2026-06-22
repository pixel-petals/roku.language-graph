/**
 * sdk-refs.mjs
 *
 * Loads the pre-built SDK graph and provides lightweight lookups for
 * connecting an app graph to the SDK graph by reference.
 *
 * "By reference" means: the app graph gets stub nodes with a `sdkId`
 * attribute pointing to the canonical ID in the SDK graph, but none of
 * the SDK graph's own definitions (methods, fields, interfaces) are
 * copied into the app graph.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SDK_GRAPH_PATH = path.resolve(__dirname, '../exports/studio/graph.json');

let _index = null;

function loadIndex() {
  if (_index) return _index;

  if (!fs.existsSync(SDK_GRAPH_PATH)) {
    console.warn(`[sdk-refs] SDK graph not found at ${SDK_GRAPH_PATH} — run npm run generate-sdk-exports first`);
    return (_index = { byLabel: new Map(), methodToIface: new Map() });
  }

  const { nodes, links } = JSON.parse(fs.readFileSync(SDK_GRAPH_PATH, 'utf8'));

  // label (case-insensitive) → { sdkId, label, type }
  const byLabel = new Map();
  for (const n of nodes) {
    if (n.label) byLabel.set(n.label.toLowerCase(), { sdkId: n.id, label: n.label, sdkType: n.type });
  }

  // method label (lowercase) → Set of interface sdkIds that own it
  const methodToIface = new Map();
  // Build interface sdkId → label map first
  const ifaceById = new Map(nodes.filter(n => n.type === 'interface').map(n => [n.id, n.label]));

  for (const link of links) {
    if (link.relation !== 'has_method') continue;
    const ifaceEntry = ifaceById.get(link.source);
    if (!ifaceEntry) continue;
    const methodNode = nodes.find(n => n.id === link.target);
    if (!methodNode?.label) continue;

    const key = methodNode.label.toLowerCase();
    if (!methodToIface.has(key)) methodToIface.set(key, new Set());
    methodToIface.get(key).add(link.source);
  }

  return (_index = { byLabel, methodToIface });
}

/**
 * Resolve a component/node name to its SDK graph entry.
 * Used for `extends` targets and CreateObject() arguments.
 * Returns { sdkId, label, sdkType } or null.
 */
export function resolveSDKNode(name) {
  const { byLabel } = loadIndex();
  return byLabel.get(name.toLowerCase()) ?? null;
}

/**
 * Resolve a method call name to the interface(s) that define it.
 * Returns array of { sdkId, label } for matching interfaces, empty if none.
 */
export function resolveSDKMethod(methodName) {
  const { byLabel, methodToIface } = loadIndex();
  const ifaceIds = methodToIface.get(methodName.toLowerCase());
  if (!ifaceIds?.size) return [];

  const results = [];
  for (const ifaceId of ifaceIds) {
    const entry = [...byLabel.values()].find(e => e.sdkId === ifaceId);
    if (entry) results.push(entry);
  }
  return results;
}

/**
 * Return true if the SDK graph is available.
 */
export function sdkGraphAvailable() {
  return fs.existsSync(SDK_GRAPH_PATH);
}
