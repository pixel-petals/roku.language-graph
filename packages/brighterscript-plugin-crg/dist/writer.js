"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphWriter = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
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
class GraphWriter {
    constructor(dbPath) {
        this.pendingNodes = [];
        this.pendingEdges = [];
        this.dirtyFilePaths = new Set();
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        this.db = new better_sqlite3_1.default(dbPath);
        this.db.exec(SCHEMA);
        this.db
            .prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('parser', 'brighterscript')")
            .run();
    }
    upsertNodes(nodes) {
        for (const n of nodes) {
            this.pendingNodes.push(n);
            this.dirtyFilePaths.add(n.filePath);
        }
    }
    upsertEdges(edges) {
        for (const e of edges) {
            this.pendingEdges.push(e);
            this.dirtyFilePaths.add(e.filePath);
        }
    }
    flush() {
        if (this.pendingNodes.length === 0 && this.pendingEdges.length === 0)
            return;
        const now = Date.now() / 1000;
        const deleteEdgesByFile = this.db.prepare('DELETE FROM edges WHERE file_path = ?');
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
                upsertNode.run(n.kind, n.name, n.qualifiedName, n.filePath, n.lineStart, n.lineEnd, n.language, n.parentName, n.params, n.returnType, n.modifiers, n.isTest ? 1 : 0, n.fileHash, JSON.stringify(n.extra), now);
            }
            for (const e of this.pendingEdges) {
                insertEdge.run(e.kind, e.sourceQualified, e.targetQualified, e.filePath, e.line, JSON.stringify(e.extra), e.confidence, e.confidenceTier, now);
            }
        });
        commit();
        this.pendingNodes = [];
        this.pendingEdges = [];
        this.dirtyFilePaths.clear();
    }
    queryAll() {
        return {
            nodes: this.db.prepare('SELECT * FROM nodes ORDER BY file_path, line_start').all(),
            edges: this.db.prepare('SELECT * FROM edges ORDER BY file_path, line').all(),
        };
    }
    close() {
        this.db.close();
    }
}
exports.GraphWriter = GraphWriter;
//# sourceMappingURL=writer.js.map