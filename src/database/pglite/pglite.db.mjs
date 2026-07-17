/**
 * pglite.db.mjs
 *
 * GraphStore backend on `@electric-sql/pglite` (embedded WASM Postgres),
 * with the `pgvector` extension enabled so nodes can carry a
 * similarity-searchable embedding alongside their graph data.
 */

import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';

// ponytail: 384 dims fits common local sentence-transformer models
// (e.g. all-MiniLM-L6-v2). No embedding model is wired up yet — bump this
// (and re-create the database) once one is chosen and its dimension differs.
const DEFAULT_EMBEDDING_DIM = 384;

function schema(embeddingDim) {
  return `
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS nodes (
    id              SERIAL PRIMARY KEY,
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
    embedding       vector(${embeddingDim}),
    updated_at      DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS edges (
    id                SERIAL PRIMARY KEY,
    kind              TEXT    NOT NULL,
    source_qualified  TEXT    NOT NULL,
    target_qualified  TEXT    NOT NULL,
    file_path         TEXT    NOT NULL,
    line              INTEGER DEFAULT 0,
    extra             TEXT    DEFAULT '{}',
    confidence        DOUBLE PRECISION DEFAULT 1.0,
    confidence_tier   TEXT    DEFAULT 'DECLARED',
    updated_at        DOUBLE PRECISION NOT NULL
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
}

const UPSERT_NODE = `
  INSERT INTO nodes
    (kind, name, qualified_name, file_path, line_start, line_end, language,
     parent_name, params, return_type, modifiers, is_test, file_hash, extra, updated_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
  ON CONFLICT (qualified_name) DO UPDATE SET
    kind = EXCLUDED.kind, name = EXCLUDED.name, file_path = EXCLUDED.file_path,
    line_start = EXCLUDED.line_start, line_end = EXCLUDED.line_end, language = EXCLUDED.language,
    parent_name = EXCLUDED.parent_name, params = EXCLUDED.params, return_type = EXCLUDED.return_type,
    modifiers = EXCLUDED.modifiers, is_test = EXCLUDED.is_test, file_hash = EXCLUDED.file_hash,
    extra = EXCLUDED.extra, updated_at = EXCLUDED.updated_at
`;

const INSERT_EDGE = `
  INSERT INTO edges
    (kind, source_qualified, target_qualified, file_path, line, extra, confidence, confidence_tier, updated_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
`;

function nodeParams(n, now) {
  return [
    n.kind, n.name, n.qualifiedName, n.filePath, n.lineStart ?? null, n.lineEnd ?? null,
    n.language ?? null, n.parentName ?? null, n.params ?? null, n.returnType ?? null,
    n.modifiers ? JSON.stringify(n.modifiers) : null, n.isTest ? 1 : 0, n.fileHash ?? null,
    JSON.stringify(n.extra ?? {}), now,
  ];
}

function edgeParams(e, now) {
  return [
    e.kind, e.sourceQualified, e.targetQualified, e.filePath, e.line ?? 0,
    JSON.stringify(e.extra ?? {}), e.confidence ?? 1.0, e.confidenceTier ?? 'DECLARED', now,
  ];
}

function toVectorLiteral(embedding) {
  return `[${embedding.join(',')}]`;
}

/** Inverse of nodeParams — round-trips a stored row back to the record shape upsertNodes accepts. */
function rowToNode(row) {
  return {
    kind: row.kind, name: row.name, qualifiedName: row.qualified_name, filePath: row.file_path,
    lineStart: row.line_start, lineEnd: row.line_end, language: row.language, parentName: row.parent_name,
    params: row.params, returnType: row.return_type,
    modifiers: row.modifiers ? JSON.parse(row.modifiers) : null,
    isTest: row.is_test === 1, fileHash: row.file_hash,
    extra: row.extra ? JSON.parse(row.extra) : {},
  };
}

/** Inverse of edgeParams — round-trips a stored row back to the record shape upsertEdges accepts. */
function rowToEdge(row) {
  return {
    kind: row.kind, sourceQualified: row.source_qualified, targetQualified: row.target_qualified,
    filePath: row.file_path, line: row.line, extra: row.extra ? JSON.parse(row.extra) : {},
    confidence: row.confidence, confidenceTier: row.confidence_tier,
  };
}

/**
 * Open a GraphStore backed by an embedded PGlite database.
 * @param {{ path?: string, embeddingDim?: number }} [config]
 */
export async function openPgliteStore(config = {}) {
  const { path: dataDir, embeddingDim = DEFAULT_EMBEDDING_DIM } = typeof config === 'string' ? { path: config } : config;

  const db = new PGlite(dataDir, { extensions: { vector } });
  await db.exec(schema(embeddingDim));
  await db.query("INSERT INTO metadata (key, value) VALUES ('parser', 'brighterscript') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value");

  let pendingNodes = [];
  let pendingEdges = [];
  const dirtyFilePaths = new Set();

  return {
    async upsertNodes(nodes) {
      for (const n of nodes) {
        pendingNodes.push(n);
        dirtyFilePaths.add(n.filePath);
      }
    },

    async upsertEdges(edges) {
      for (const e of edges) {
        pendingEdges.push(e);
        dirtyFilePaths.add(e.filePath);
      }
    },

    async flush() {
      if (!pendingNodes.length && !pendingEdges.length) return;
      const now = Date.now() / 1000;
      await db.transaction(async (tx) => {
        for (const fp of dirtyFilePaths) await tx.query('DELETE FROM edges WHERE file_path = $1', [fp]);
        for (const n of pendingNodes) await tx.query(UPSERT_NODE, nodeParams(n, now));
        for (const e of pendingEdges) await tx.query(INSERT_EDGE, edgeParams(e, now));
      });
      pendingNodes = [];
      pendingEdges = [];
      dirtyFilePaths.clear();
    },

    /** Set (or clear, with null) a node's embedding by qualified name. */
    async upsertEmbedding(qualifiedName, embedding) {
      const literal = embedding ? toVectorLiteral(embedding) : null;
      await db.query('UPDATE nodes SET embedding = $1 WHERE qualified_name = $2', [literal, qualifiedName]);
    },

    /** Find the `limit` nodes with embeddings nearest `embedding` (cosine distance). */
    async queryNearestNodes(embedding, limit = 10) {
      const result = await db.query(
        `SELECT *, embedding <=> $1 AS distance FROM nodes WHERE embedding IS NOT NULL ORDER BY distance LIMIT $2`,
        [toVectorLiteral(embedding), limit],
      );
      return result.rows;
    },

    /** Round-trips the stored graph back to the same record shape upsertNodes/upsertEdges accept (embedding excluded — see queryNearestNodes). */
    async queryAll() {
      const nodes = await db.query(`
        SELECT kind, name, qualified_name, file_path, line_start, line_end, language,
               parent_name, params, return_type, modifiers, is_test, file_hash, extra
        FROM nodes ORDER BY file_path, line_start
      `);
      const edges = await db.query(`
        SELECT kind, source_qualified, target_qualified, file_path, line, extra, confidence, confidence_tier
        FROM edges ORDER BY file_path, line
      `);
      return { nodes: nodes.rows.map(rowToNode), edges: edges.rows.map(rowToEdge) };
    },

    async close() {
      await db.close();
    },
  };
}
