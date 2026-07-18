import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

// Vite's own root/outDir must be absolute (or resolved relative to this
// file) since `--config` can be invoked from any cwd (see the "view-graph"
// npm script, which runs from the repo root).
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  build: {
    outDir: fileURLToPath(new URL('../../.build/db-graph', import.meta.url)),
    emptyOutDir: true,
  },
  plugins: [viteSingleFile()],
});
