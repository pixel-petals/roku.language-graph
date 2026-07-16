# roku-graphify

BrightScript code graph analysis tool powered by [tree-sitter](https://tree-sitter.github.io/tree-sitter/). Parses Roku BrightScript (`.brs`) source into a call graph of functions/subs and their call edges, and can analyze a whole Roku app (source + components) into a browsable graph with community detection, a Markdown wiki, and a static HTML studio.

## How it fits together

```
packages/
  tree-sitter/brightscript/   Tree-sitter grammar for BrightScript (Rust, native Node addon)
  bsc-graph/                  BrighterScript compiler plugin, extracts a code graph into a
                               code-review-graph SQLite database
src/
  brightscript/          Parses a single file with the grammar into a function/call graph
  app/                   Builds a whole-app graph (multiple files) and bridges to @sentropic/graphify
  sdk/                   Loads/queries a pre-built Roku SDK reference graph, for resolving calls
                          into built-in Roku interfaces (roScreen, roMessagePort, ...)
  ebnf/                  Generates EBNF grammar documentation
  cli/                   Command-line entry points
examples/roku-app/       A full sample Roku app (see its own README) for exercising analyze-app
exports/                 Generated artifacts: EBNF grammars, the Roku SDK reference graph, wiki/studio output
```

### Parsing pipeline

1. **`packages/tree-sitter/brightscript/`** — the tree-sitter grammar itself (`grammar.js`, compiled to a native Node addon via `node-gyp`). Has its own `README.md`, `QUICKSTART.md`, and `GRAPHIFY.md` with grammar-specific details.
2. **`src/brightscript/`** — `parser.js` wraps the compiled grammar; `queries.js` runs tree-sitter queries to extract functions, calls, assignments, and types; `graph.js` (`BrightScriptGraph`) assembles query results into a function/call graph for one file; `index.js` exposes `analyze(code)` returning `{ tree, graph, functions, calls, assignments, types }`.
3. **`src/app/graphify.js`** — bridges a single file's tree-sitter graph into a [graphology](https://graphology.github.io/)-compatible payload consumable by [`@sentropic/graphify`](https://www.npmjs.com/package/@sentropic/graphify).
4. **`src/app/graph.mjs`** — `buildAppGraph(appDir)` walks a whole Roku app directory (source + components) into one combined graph.
5. **`src/sdk/`** — `graph.js` loads a pre-built Roku SDK reference graph (interfaces, methods, fields scraped from Roku's SDK docs); `refs.mjs` resolves app-graph nodes (e.g. `CreateObject("roScreen")`, method calls) to that SDK graph *by reference* — it links to the SDK graph's IDs without copying SDK definitions into the app graph.

## CLI usage

```bash
npm install

# Analyze a single .brs file
node src/cli/analyze-file.js <file.brs> --format dot|json|summary

# Analyze a whole Roku app directory (must contain source/ and components/)
node src/cli/analyze-app.mjs <app-dir> [output-dir]

# Regenerate the Roku SDK reference graph from SDK docs
node src/cli/generate-exports.mjs [<sdk-docs-path>]

# Regenerate EBNF grammar documentation
node src/ebnf/generate.mjs
```

Or via npm scripts:

| Script | Description |
|---|---|
| `npm run build-grammar` | Compile the tree-sitter BrightScript grammar (`tree-sitter generate` + `node-gyp`) |
| `npm run test` | Smoke test: require the app module |
| `npm run generate-sdk-exports` | Regenerate `exports/` (Roku SDK graph, wiki, static studio) |
| `npm run generate-ebnf` | Regenerate EBNF grammar files in `exports/` |
| `npm run analyze-app` | Run `analyze-app.mjs` |

`analyze-app.mjs` writes to `<app-dir>/graphify-output/` by default:

- `.graphify-state/graph.json` — raw graph data
- `wiki/` — Markdown wiki pages, one per detected community
- `studio/index.html` — self-contained static HTML graph explorer

The globally installed CLI binary is `roku-graphify` (see `bin` in `package.json`), which maps to `src/cli/analyze-file.js`.

## Output formats

`analyze-file.js` supports:

- `dot` (default) — Graphviz DOT format of the function/call graph
- `json` — raw graph JSON (`functions`, `calls`)
- `summary` — human-readable function list and call edges with weights

## Packages

### `packages/bsc-graph`

A [BrighterScript](https://github.com/rokucommunity/brighterscript) v1 compiler plugin (TypeScript) that extracts a code graph directly from BrighterScript's own compilation pipeline and writes it into a `code-review-graph` SQLite database (via `better-sqlite3`), for use by the [code-review-graph](https://www.npmjs.com/package/@sentropic/graphify) tooling. Build with `npm run build` inside that package (runs `tsc`).

## Demo app

`examples/roku-app/` is a complete sample Roku app (source, components, manifest) — see `examples/roku-app/README.md` for details. Use it as input to `analyze-app.mjs` to see the full app-graph pipeline end to end.

## Configuration

`.code-review-graph/languages.toml` configures language support for the [code-review-graph](https://www.npmjs.com/package/@sentropic/graphify) tooling used across this repo's analysis pipeline.

## License

MIT
