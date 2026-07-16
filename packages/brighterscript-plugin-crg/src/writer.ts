import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { CrgNode, CrgEdge } from './extractor';

// Matches the code-review-graph schema (migrations v1).
// We only create the tables we write; code-review-graph manages the rest.
const SCHEMA = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS nodes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    kind            TEXT    NOT NULL,
    name            TEXT    NOT NULL,
    qualified_name  TEXT    NOT NULL UNIQUE,
    file_path       TEXT    NOT NULL,
    line_start      INTEGER,
    line_end        INTEGER,
    language        TEXT,
    parent_name     TEXT,
    params          TEXT,
    return_type     TEXT,
    modifiers       TEXT,
    is_test         INTEGER DEFAULT 0,
    file_hash       TEXT,
    extra           TEXT    DEFAULT '{}',
    updated_at      REAL    NOT NULL
);

CREATE TABLE IF NOT EXISTS edges (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    kind              TEXT    NOT NULL,
    source_qualified  TEXT    NOT NULL,
    target_qualified  TEXT    NOT NULL,
    file_path         TEXT    NOT NULL,
    line              INTEGER DEFAULT 0,
    extra             TEXT    DEFAULT '{}',
    confidence        REAL    DEFAULT 1.0,
    confidence_tier   TEXT    DEFAULT 'EXTRACTED',
    updated_at        REAL    NOT NULL
);

CREATE TABLE IF NOT EXISTS metadata (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nodes_file      ON nodes(file_path);
CREATE INDEX IF NOT EXISTS idx_nodes_kind      ON nodes(kind);
CREATE INDEX IF NOT EXISTS idx_nodes_qualified ON nodes(qualified_name);
CREATE INDEX IF NOT EXISTS idx_edges_source    ON edges(source_qualified);
CREATE INDEX IF NOT EXISTS idx_edges_target    ON edges(target_qualified);
CREATE INDEX IF NOT EXISTS idx_edges_kind      ON edges(kind);
CREATE INDEX IF NOT EXISTS idx_edges_file      ON edges(file_path);
`;

export class GraphWriter {
  private db: Database.Database;
  private pendingNodes: CrgNode[] = [];
  private pendingEdges: CrgEdge[] = [];
  private dirtyFilePaths = new Set<string>();

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.exec(SCHEMA);
    this.db
      .prepare(
        "INSERT OR REPLACE INTO metadata (key, value) VALUES ('parser', 'brighterscript')",
      )
      .run();
  }

  upsertNodes(nodes: CrgNode[]): void {
    for (const n of nodes) {
      this.pendingNodes.push(n);
      this.dirtyFilePaths.add(n.filePath);
    }
  }

  upsertEdges(edges: CrgEdge[]): void {
    for (const e of edges) {
      this.pendingEdges.push(e);
      this.dirtyFilePaths.add(e.filePath);
    }
  }

  flush(): void {
    if (this.pendingNodes.length === 0 && this.pendingEdges.length === 0) return;

    const now = Date.now() / 1000;

    const deleteEdgesByFile = this.db.prepare(
      'DELETE FROM edges WHERE file_path = ?',
    );

    const upsertNode = this.db.prepare(`
      INSERT OR REPLACE INTO nodes
        (kind, name, qualified_name, file_path, line_start, line_end,
         language, parent_name, params, return_type, modifiers, is_test,
         file_hash, extra, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertEdge = this.db.prepare(`
      INSERT INTO edges
        (kind, source_qualified, target_qualified, file_path, line, extra,
         confidence, confidence_tier, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const commit = this.db.transaction(() => {
      // Clear stale edges for every file we're about to rewrite
      for (const fp of this.dirtyFilePaths) {
        deleteEdgesByFile.run(fp);
      }

      for (const n of this.pendingNodes) {
        upsertNode.run(
          n.kind,
          n.name,
          n.qualifiedName,
          n.filePath,
          n.lineStart,
          n.lineEnd,
          n.language,
          n.parentName,
          n.params,
          n.returnType,
          n.modifiers,
          n.isTest ? 1 : 0,
          n.fileHash,
          JSON.stringify(n.extra),
          now,
        );
      }

      for (const e of this.pendingEdges) {
        insertEdge.run(
          e.kind,
          e.sourceQualified,
          e.targetQualified,
          e.filePath,
          e.line,
          JSON.stringify(e.extra),
          e.confidence,
          e.confidenceTier,
          now,
        );
      }
    });

    commit();
    this.pendingNodes = [];
    this.pendingEdges = [];
    this.dirtyFilePaths.clear();
  }

  queryAll(): { nodes: unknown[]; edges: unknown[] } {
    return {
      nodes: this.db.prepare('SELECT * FROM nodes ORDER BY file_path, line_start').all(),
      edges: this.db.prepare('SELECT * FROM edges ORDER BY file_path, line').all(),
    };
  }

  close(): void {
    this.db.close();
  }
}
