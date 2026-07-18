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

  const nodes = [];
  const edges = [];
  for (const file of Object.values(program.files)) {
    const result = isBrsFile(file) ? extractBrsFile(file, program, costModel)
      : isXmlFile(file) ? extractXmlFile(file, program)
      : null;
    if (!result) continue;
    nodes.push(...result.nodes);
    edges.push(...result.edges);
  }
  program.dispose?.();
  return { nodes, edges };
}
