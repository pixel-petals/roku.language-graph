/**
 * tests/helpers/temp-store.mjs
 *
 * Opens a GraphStore at a fresh temp directory per call — PGlite's vector
 * extension fails to load in true in-memory mode (`new PGlite()` with no
 * dataDir), so a unique on-disk temp path per test is this project's
 * "ephemeral instance" per CLAUDE.md's isolation rule instead. Caller is
 * responsible for calling the returned `cleanup()` (register it with
 * `t.after` in the calling test).
 */

import { openGraphStore } from '../../src/database/database.store.mjs';
import os from 'os';
import path from 'path';
import fs from 'fs';

export async function openTempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roku-graphify-test-'));
  const store = await openGraphStore(path.join(dir, 'graph.pgdata'));
  const cleanup = async () => {
    await store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  };
  return { store, cleanup };
}
