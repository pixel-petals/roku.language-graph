import type { AfterValidateProgramEvent, Plugin, PluginFactoryOptions } from 'brighterscript';
import { isBrsFile, isXmlFile } from 'brighterscript';
import * as fs from 'fs';
import * as path from 'path';
import { extractBrsFile, extractXmlFile } from './extractor';
import { GraphWriter } from './writer';

export interface PluginOptions {
  /** Absolute or rootDir-relative path for the output SQLite database.
   *  Can also be set via the BSC_CRG_DB_PATH environment variable.
   *  Defaults to <rootDir>/.code-review-graph/graph.db */
  dbPath?: string;
}

function stripRoot(s: string, prefix: string): string {
  // Only strip if the string starts with the root prefix.
  // Bare callee names (e.g. "parseResponse", "m.top.setFocus") are left as-is.
  return s.startsWith(prefix) ? s.slice(prefix.length) : s;
}

function relativizePaths(
  data: { nodes: unknown[]; edges: unknown[] },
  rootDir: string,
): { nodes: unknown[]; edges: unknown[] } {
  const prefix = rootDir.endsWith(path.sep) ? rootDir : rootDir + path.sep;

  function rel(qname: string): string {
    // qualified names may be "abs/path::symbol" or just "abs/path"
    const sep = qname.indexOf('::');
    if (sep === -1) return stripRoot(qname, prefix);
    return stripRoot(qname.slice(0, sep), prefix) + '::' + qname.slice(sep + 2);
  }

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodes: (data.nodes as any[]).map(n => ({
      ...n,
      file_path: stripRoot(n.file_path as string, prefix),
      qualified_name: rel(n.qualified_name as string),
      parent_name: n.parent_name ? rel(n.parent_name as string) : n.parent_name,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    edges: (data.edges as any[]).map(e => ({
      ...e,
      file_path: stripRoot(e.file_path as string, prefix),
      source_qualified: rel(e.source_qualified as string),
      target_qualified: rel(e.target_qualified as string),
    })),
  };
}

export default function crgPlugin(
  options: PluginOptions = {},
  // second arg is the standard v1 PluginFactoryOptions (version info); unused here
  _bscOptions?: PluginFactoryOptions,
): Plugin {
  return {
    name: 'bsc-graph',

    afterValidateProgram(event: AfterValidateProgramEvent) {
      if (event.wasCancelled) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rootDir: string = (event.program.options as any).rootDir ?? process.cwd();

      const rawDbPath =
        options.dbPath ??
        process.env['BSC_CRG_DB_PATH'] ??
        path.join(rootDir, '.code-review-graph', 'graph.db');

      const dbPath = path.isAbsolute(rawDbPath)
        ? rawDbPath
        : path.resolve(rootDir, rawDbPath);

      const writer = new GraphWriter(dbPath);
      try {
        for (const file of Object.values(event.program.files)) {
          if (isBrsFile(file)) {
            const { nodes, edges } = extractBrsFile(file, event.program);
            writer.upsertNodes(nodes);
            writer.upsertEdges(edges);
          } else if (isXmlFile(file)) {
            const { nodes, edges } = extractXmlFile(file, event.program);
            writer.upsertNodes(nodes);
            writer.upsertEdges(edges);
          }
        }
      } finally {
        writer.flush();
        const jsonPath = dbPath.replace(/\.db$/, '.json');
        const absRootDir = path.resolve(rootDir);
        fs.writeFileSync(jsonPath, JSON.stringify(relativizePaths(writer.queryAll(), absRootDir), null, 2));
        writer.close();
      }
    },
  };
}
