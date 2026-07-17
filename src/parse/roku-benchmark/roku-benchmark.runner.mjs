/**
 * roku-benchmark.runner.mjs
 *
 * Runs bsbench (modules/roku-benchmark) against a real Roku device and
 * captures its stdout. Detects completion by output quiescence (no new
 * stdout at all for `quiescenceMs`) and kills the process tree itself —
 * best-effort by necessity, bsbench gives us nothing better to key off of.
 *
 * Verified against a real device run (small `--only` suite): the process
 * actually exited on its own once done, and produced zero `bsbenchStatus:`
 * JSON lines — only the human-readable "FINAL RESULTS" tables (real
 * bsbench source reading suggested the process never exits and always
 * emits bsbenchStatus; neither held up in practice). Quiescence now resets
 * on any stdout, not just status lines, and "did this run produce
 * anything real" is judged by either signal — whichever bsbench actually
 * gives us.
 */

import { spawn, execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUBMODULE_DIR = path.resolve(__dirname, '../../../modules/roku-benchmark');
const STATUS_LINE = /^\s*bsbenchStatus:/m;
const FINAL_RESULTS_LINE = /--\s+FINAL RESULTS/;

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

// bsbench's CLI (yargs `--only`, type: 'array') opens an interactive
// autocompleteMultiselect prompt whenever `only` resolves to an empty
// array — which a headless spawn can never answer, hanging forever. Always
// pass a real pattern so that branch is never reachable; '.*' (via the
// suite-name-matching `--only` regex) selects every suite, same as
// omitting the flag would in an interactive run.
const ALL_SUITES = '.*';

/** Wrap a value in double quotes for a shell command line — good enough for the host/password/pattern values this runner actually passes (no embedded quotes expected). */
function quoteArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

/**
 * Run bsbench against a device and return its full captured stdout once the
 * output goes quiet. @param {{host: string, password: string, only?: string, quiescenceMs?: number}} options
 */
export function runBsbench({ host, password, only, quiescenceMs = 8000 }) {
  assertBsbenchInstalled();

  // A single pre-quoted command string, not an args array — shell:true is
  // required on Windows (spawning npm.cmd directly without it throws
  // EINVAL), but shell:true + an args array is the specific unsafe
  // combination Node warns about (it concatenates without escaping), and
  // is exactly what silently mangled --only's value the first time this
  // ran, empty-arraying it into an unanswerable interactive prompt.
  const command = `npm run benchmark -- --host ${quoteArg(host)} --password ${quoteArg(password)} --only ${quoteArg(only || ALL_SUITES)}`;

  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: SUBMODULE_DIR,
      shell: true,
      detached: process.platform !== 'win32',
    });
    child.stdin.end(); // defense in depth: if a prompt ever does trigger, fail fast instead of hanging on a TTY that will never answer

    let output = '';
    let quiescenceTimer = null;

    const scheduleQuiescenceCheck = () => {
      clearTimeout(quiescenceTimer);
      quiescenceTimer = setTimeout(() => {
        killTree(child.pid);
      }, quiescenceMs);
    };

    // Second, unconditional safety net independent of quiescence — if
    // bsbench really does hang forever on some run (its own source reads
    // like it should, even though a small real run exited on its own),
    // this is the only thing that stops the process from running forever.
    const maxRuntimeTimer = setTimeout(() => killTree(child.pid), 20 * 60 * 1000);

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      scheduleQuiescenceCheck(); // any output counts — real runs are almost entirely human-readable text, not bsbenchStatus lines
    });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });

    child.on('error', (err) => {
      clearTimeout(quiescenceTimer);
      clearTimeout(maxRuntimeTimer);
      reject(err);
    });

    child.on('close', () => {
      clearTimeout(quiescenceTimer);
      clearTimeout(maxRuntimeTimer);
      if (!STATUS_LINE.test(output) && !FINAL_RESULTS_LINE.test(output)) {
        reject(new Error(`bsbench produced no recognizable results before exiting — check host/password and device connectivity.\n${output.slice(-2000)}`));
        return;
      }
      resolve(output);
    });
  });
}
