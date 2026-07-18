'use strict';

/**
 * Scrapes structured data out of one Roku SDK markdown doc page: title,
 * deprecation flag, prose description, supported interfaces, parent type,
 * methods, and fields. Pure text-in/data-out — no knowledge of the graph
 * shape these get assembled into (see roku-sdk.graph.js).
 */

const fs = require('fs');
const path = require('path');

// ── Frontmatter helpers ───────────────────────────────────────────────────────

function extractFrontmatterTitle(content) {
  const m = content.match(/^---\s*\n(?:[\s\S]*?\n)?title:\s*["']?([^"'\n]+?)["']?\s*\n/);
  return m ? m[1].trim() : null;
}

function extractFrontmatterDeprecated(content) {
  const m = content.match(/\ndeprecated:\s*(true|false)/);
  return m ? m[1] === 'true' : false;
}

/**
 * Prose description: the frontmatter `excerpt` (always present, concise) plus
 * the body's intro paragraph(s) before the first `##` section (present on
 * some docs, absent on others that go straight into a table). This is the
 * text meant to be fed to upsertEmbedding() for semantic search.
 */
function extractDescription(content) {
  const fm = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  const frontmatter = fm ? fm[0] : '';
  const body = fm ? content.slice(fm[0].length) : content;

  const excerptMatch = frontmatter.match(/\nexcerpt:\s*['"]?([^\n]*?)['"]?\s*\n/);
  const excerpt = excerptMatch ? excerptMatch[1].trim() : null;

  const introMatch = body.match(/^[\s\S]*?(?=\n##\s|$)/);
  const intro = introMatch ? introMatch[0].trim() : null;

  const parts = [excerpt, intro].filter(Boolean);
  return parts.length ? parts.join('\n\n') : null;
}

// ── Interface extraction ──────────────────────────────────────────────────────

function extractSupportedInterfaces(content) {
  const m = content.match(/##\s+Supported interfaces\s*\n([\s\S]*?)(?:\n##|\n---|\n\*\*|$)/i);
  if (!m) return [];
  const names = [];
  for (const match of m[1].matchAll(/\[([^\]]+)\]\(doc:/g)) {
    names.push(match[1].trim());
  }
  return names;
}

function extractExtends(content) {
  const m = content.match(/Extends\s+\[(?:\*\*)?([^\]]+?)(?:\*\*)?\]\(/);
  return m ? m[1].trim() : null;
}

// ── Function/method extraction ────────────────────────────────────────────────

/**
 * Parse "### FunctionName(params) As ReturnType" headers from a ## Supported methods section.
 * Returns array of { name, signature, params, returnType }.
 */
function extractMethods(content) {
  const sectionMatch = content.match(/##\s+Supported methods\s*\n([\s\S]*?)(?:\n## [^#]|$)/i);
  if (!sectionMatch) return [];

  const methods = [];
  for (const m of sectionMatch[1].matchAll(/^###\s+(.+)$/gm)) {
    const signature = m[1].trim();
    // "FunctionName(params) As ReturnType" or "FunctionName(params)"
    const sigMatch = signature.match(/^(\w+)\(([^)]*)\)(?:\s+[Aa]s\s+(\S+))?/);
    if (!sigMatch) continue;
    methods.push({
      name: sigMatch[1],
      signature,
      params: sigMatch[2].trim() || null,
      returnType: sigMatch[3] || null,
    });
  }
  return methods;
}

// ── Field/attribute extraction ────────────────────────────────────────────────

/**
 * Parse fields from ## Fields section — handles both HTML <table> and markdown | table | formats.
 * Returns array of { name, type, defaultValue, access }.
 */
function extractFields(content) {
  const sectionMatch = content.match(/##\s+Fields\s*\n([\s\S]*?)(?:\n## [^#]|$)/i);
  if (!sectionMatch) return [];
  const section = sectionMatch[1];
  const fields = [];
  const seen = new Set();

  // Markdown table rows: | fieldName | type | default | access | desc |
  for (const m of section.matchAll(/^\|\s*([^|*\-][^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/gm)) {
    const name = m[1].trim();
    if (!name || /^-+$/.test(name) || /^Field$/i.test(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    fields.push({ name, type: m[2].trim() || null, defaultValue: m[3].trim() || null, access: m[4].trim() || null });
  }

  // Compact single-line HTML: <tr><td>name</td><td>type</td><td>default</td><td>access</td>...
  // Uses [^<]* so it naturally stops before any nested HTML (e.g. tables in description cells)
  for (const row of section.matchAll(/<tr>\s*<td>([^<]+)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>/gi)) {
    const name = row[1].trim();
    if (!name || /^Field$/i.test(name) || seen.has(name)) continue;
    seen.add(name);
    fields.push({ name, type: row[2].trim() || null, defaultValue: row[3].trim() || null, access: row[4].trim() || null });
  }

  // Multi-line HTML (<thead>/<tbody> style): extract <tr> blocks, pull <td> values from each.
  // Inner table rows in description cells only have 2 cols (no header) so cells.length < 4 filters them.
  for (const row of section.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(c => c[1].replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').trim());
    if (cells.length < 4) continue;
    const name = cells[0];
    if (!name || /^Field$/i.test(name) || seen.has(name) || !/^\w/.test(name)) continue;
    seen.add(name);
    fields.push({ name, type: cells[1] || null, defaultValue: cells[2] || null, access: cells[3] || null });
  }

  return fields;
}

// ── File helpers ──────────────────────────────────────────────────────────────

function readMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md') && f !== 'index.md')
    .map(f => ({ file: f, content: fs.readFileSync(path.join(dir, f), 'utf-8') }));
}

module.exports = {
  extractFrontmatterTitle,
  extractFrontmatterDeprecated,
  extractDescription,
  extractSupportedInterfaces,
  extractExtends,
  extractMethods,
  extractFields,
  readMarkdownFiles,
};
