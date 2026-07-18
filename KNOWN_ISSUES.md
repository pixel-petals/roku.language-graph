# Known issues

Open items and real-world validation history — not binding rules (see
`CLAUDE.md` for those), just facts worth not re-discovering from scratch.

## Open

- **Duplicate `LocalDef` extraction.** `roku-app.flow-adapter.mjs`'s
  `getLocalDefsViaCompilerInternals` can return two identical entries for
  the same `varName@line` (confirmed on a real ~13k-node app: 200
  duplicate `LocalDef` qualifiedNames, all byte-for-byte identical — e.g. a
  `FunctionParameterExpression` binding visited twice via nested pocket
  tables). `pglite.db.mjs`'s bulk upsert dedupes by `qualifiedName`
  (last-write-wins) so this doesn't crash a parse, but the double-visit
  itself is unfixed. See the `TODO` comment directly above `getLocalDefs`
  in that file for the specific fix approach.
- **No real GUI database browser.** `cli.inspect-db.mjs` covers terminal
  browsing. A point-and-click GUI (VSCode Postgres/Database Client
  extension via `@electric-sql/pglite-socket`) needs
  `@electric-sql/pglite >=0.4.0` — verified directly that pglite 0.5.4
  cannot even open a `.pgdata` directory this project's pinned 0.2.17
  created ("PGlite failed to initialize properly"). Taking that path means
  bumping the pinned dependency, re-verifying the schema under whatever
  Postgres version 0.5.4 bundles, and regenerating every existing
  `.pgdata` file including checked-in reference databases. See README's
  "Inspecting a database" section for the full breakdown. Not done — a
  real migration cost, not a default to take silently.
- **`@electric-sql/pglite`'s WASM shutdown abort.** `_pg_shutdown` can
  hard-abort after a large `queryAll()` read on a real-app-sized graph
  (reproduced at ~13k nodes/34k edges; confirmed it's the read, not
  writes — inserting the same volume of data and closing immediately,
  with no intervening read, does not crash). Not fixable on our side (it's
  inside the WASM runtime); `pglite.db.mjs`'s `close()` catches and logs
  it rather than letting it kill the process — all data is already
  durably flushed by that point (writes happen inside `flush()`'s
  transaction, long before `close()` runs), so this is cosmetic, not data
  loss.

## Real-world validation

Validated against `pixel-petals/roku.toolkit`, orphan branch
`reference-globaltv` (576 source files; `src/` is the actual bsc
`rootDir` — its siblings `src-vendor`/`src-debug`/`src-brand` are not part
of the analyzed tree). Clone into `.artifacts/` (gitignored) to repeat:

```bash
git clone https://github.com/pixel-petals/roku.toolkit.git .artifacts/roku.toolkit
cd .artifacts/roku.toolkit && git fetch origin reference-globaltv && git checkout reference-globaltv
cd ../.. && node src/cli/cli.analyze-app.mjs .artifacts/roku.toolkit/src .artifacts/roku.toolkit-out
```

This is what surfaced every issue above plus the two now-fixed ones below
— the example app (`examples/roku-app`) is too small to trigger any of
them.

### Fixed as a result of this validation

- Per-row `INSERT` (even batched into bounded transactions) took ~77s for
  ~47k rows. Rewritten to bulk `COPY` (staging table +
  `INSERT...SELECT...ON CONFLICT` for nodes — COPY has no upsert
  semantics of its own; a direct `COPY` for edges, which have no conflict
  target). Same data now loads in ~200ms.
- A single `INSERT...SELECT...ON CONFLICT` statement can't touch the same
  target row twice, which the bulk-COPY rewrite above turned into a hard
  crash on the ~200 duplicate `LocalDef` rows described above (the old
  per-row-upsert loop just silently applied duplicates sequentially).
  Fixed by deduping a batch by `qualifiedName` (last-write-wins) before
  building the COPY payload.
