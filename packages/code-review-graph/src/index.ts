/**
 * bsc-graph — adapter package.
 *
 * Parsing (src/parse/roku-app) and storage (src/database) now live in the
 * main project; this package's job is just to port that output into the
 * SQLite format the external `code-review-graph` tool expects.
 *
 * TODO: once src/database/sqlite has a real implementation, read its graph
 * here and write it out via better-sqlite3 in the code-review-graph schema
 * (see git history for the previous writer.ts for that schema).
 */

export interface PluginOptions {
  /** Absolute or rootDir-relative path for the output SQLite database. */
  dbPath?: string;
}

export default function crgAdapter(_options: PluginOptions = {}): never {
  throw new Error('not implemented — pending src/database/sqlite');
}
