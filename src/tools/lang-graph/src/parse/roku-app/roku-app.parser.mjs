/**
 * roku-app.parser.mjs
 *
 * Loads every .brs/.bs/.xml file under a Roku app directory into a
 * `brighterscript` Program, validates it (so calls/extends/etc. resolve
 * against real symbols), and extracts nodes/edges from each file.
 */

import { Program, isBrsFile, isXmlFile } from 'brighterscript';
import fs from 'fs';
import path from 'path';
import { extractBrsFile } from './roku-app.brs.mjs';
import { extractXmlFile } from './roku-app.xml.mjs';
import { safe } from './roku-app.ast-utils.mjs';

function findSourceFiles(appDir) {
  const results = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(brs|bs|xml)$/i.test(entry.name)) results.push(full);
    }
  };
  walk(appDir);
  return results;
}

/**
 * Parse a Roku app directory into { nodes, edges } via the brighterscript compiler.
 * @param {string} appDir
 * @param {{ costModel?: object }} [options] optional benchmark cost model (see db.benchmark.mjs) for best-effort CALLS cost estimates
 */
export function parseRokuApp(appDir, { costModel } = {}) {
  const program = new Program({ rootDir: appDir });
  for (const filePath of findSourceFiles(appDir)) {
    program.setFile(path.relative(appDir, filePath), fs.readFileSync(filePath, 'utf-8'));
  }
  program.validate();

  // Map each script file to the Component that <script>-imports it, so a .brs
  // file's m.top.createChild/appendChild/etc. calls (see roku-app.brs.mjs)
  // can resolve "the node I'm running on" back to that Component's qname.
  const scriptOwners = new Map();
  for (const file of Object.values(program.files)) {
    if (!isXmlFile(file)) continue;
    const componentName = file.componentName?.text;
    if (!componentName) continue;
    const qname = `${file.srcPath}::${componentName}`;
    for (const script of file.scriptTagImports) {
      const target = script.destPath ?? script.text;
      const resolved = target ? safe(() => program.getFile(target)) : undefined;
      if (resolved?.srcPath) scriptOwners.set(resolved.srcPath, qname);
    }
  }

  const nodes = [];
  const edges = [];
  for (const file of Object.values(program.files)) {
    const result = isBrsFile(file) ? extractBrsFile(file, program, costModel, scriptOwners.get(file.srcPath))
      : isXmlFile(file) ? extractXmlFile(file, program)
      : null;
    if (!result) continue;
    nodes.push(...result.nodes);
    edges.push(...result.edges);
  }
  program.dispose?.();
  return { nodes, edges };
}
