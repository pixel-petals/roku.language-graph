/**
 * roku-benchmark.runner.mjs
 *
 * Runs bsbench (modules/roku-benchmark) against a real Roku device and
 * captures its stdout. bsbench's own CLI never exits on success — its
 * Runner.run() deliberately blocks forever after sideloading, so this
 * detects completion by output quiescence (no new `bsbenchStatus:` line
 * for `quiescenceMs`) and kills the process tree itself. This is a
 * best-effort heuristic — bsbench gives us nothing better to key off of.
 */

import { spawn, execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUBMODULE_DIR = path.resolve(__dirname, '../../../modules/roku-benchmark');
const STATUS_LINE = /^\s*bsbenchStatus:/;

function killTree(pid) {
  if (process.platform === 'win32') {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => {});
  } else {
    try { process.kill(-pid, 'SIGKILL'); } catch { /* already dead */ }
  }
}

function assertBsbenchInstalled() {
  const nodeModules = path.join(SUBMODULE_DIR, 'node_modules');
  if (!fs.existsSync(nodeModules)) {
    throw new Error(`bsbench dependencies not installed — run "npm install" in ${SUBMODULE_DIR} first`);
  }
}

/**
 * Run bsbench against a device and return its full captured stdout once the
 * output goes quiet. @param {{host: string, password: string, only?: string, quiescenceMs?: number}} options
 */
export function runBsbench({ host, password, only, quiescenceMs = 8000 }) {
  assertBsbenchInstalled();

  const args = ['run', 'benchmark', '--', '--host', host, '--password', password];
  if (only) args.push('--only', only);

  return new Promise((resolve, reject) => {
    const child = spawn('npm', args, {
      cwd: SUBMODULE_DIR,
      shell: true,
      detached: process.platform !== 'win32',
    });

    let output = '';
    let quiescenceTimer = null;
    let sawAnyStatusLine = false;

    const scheduleQuiescenceCheck = () => {
      clearTimeout(quiescenceTimer);
      quiescenceTimer = setTimeout(() => {
        killTree(child.pid);
      }, quiescenceMs);
    };

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      if (STATUS_LINE.test(text)) {
        sawAnyStatusLine = true;
        scheduleQuiescenceCheck();
      }
    });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });

    child.on('error', (err) => {
      clearTimeout(quiescenceTimer);
      reject(err);
    });

    child.on('close', () => {
      clearTimeout(quiescenceTimer);
      if (!sawAnyStatusLine) {
        reject(new Error(`bsbench produced no bsbenchStatus output before exiting — check host/password and device connectivity.\n${output.slice(-2000)}`));
        return;
      }
      resolve(output);
    });
  });
}
