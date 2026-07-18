# CLAUDE.md

Project-specific rules for working in `roku-graphify`. These are binding —
follow them even under context pressure or mid-refactor; don't let them
drift out of a long session.

## Naming convention

Every file: `<cluster>.<scope>.<ext>`, where `<cluster>` matches its
containing directory (e.g. `src/parse/roku-app/roku-app.brs.mjs`,
`src/parse/jsdoc/jsdoc.extract.mjs`). A new cluster is a new subdirectory
with its own prefix, not a loose file bolted onto an existing one.

## Code style

- **YAGNI first.** Don't add features, refactor, or introduce abstractions
  beyond what the task requires. A bug fix doesn't need surrounding
  cleanup; a one-shot operation doesn't need a helper. Don't design for
  hypothetical future requirements — three similar lines beat a premature
  abstraction, and a declarative lookup table beats a `switch` when the
  cases are just data (see `jsdoc.snippets.mjs`).
- **No speculative robustness.** Don't add error handling, fallbacks, or
  validation for scenarios that can't happen. Trust internal code and
  framework guarantees; only validate at real system boundaries (user
  input, external APIs, a third-party library that's known to throw).
- **Comments: WHY, not WHAT.** Default to no comments. Only add one when
  the reasoning isn't visible in the code itself — a hidden constraint, a
  workaround for a specific verified bug, a non-obvious invariant. Never
  restate what well-named code already says, never reference "the current
  fix" or a specific past conversation (comments outlive the session that
  wrote them).
  - **Watch for literal `*/` inside a block comment's prose** — it
    terminates the comment early and breaks the file. Hit repeatedly this
    session (e.g. writing "ro*/if*-prefixed" to mean "ro- or if-prefixed").
    Reword around it; never let the two-character sequence appear in
    comment text for any reason.
- **Ponytail bias**: prefer stdlib/native platform features over new
  dependencies, and a new dependency over hand-rolled code that duplicates
  what a well-known library already does correctly (e.g. reusing
  `brighterscript-jsdocs-plugin`'s comment parsing rather than
  reimplementing BrightScriptDoc tag parsing from scratch).
- Mark a deliberate shortcut with a `// ponytail: <what/why/upgrade-path>`
  comment rather than silently leaving it unexplained.

## Verification discipline

Before implementing or recommending a fix based on a technical claim —
whether it's an architectural assumption about a third-party dependency
("pglite should handle this," "the plugin parses X correctly"), a
performance hypothesis ("batching the writes should fix the crash"), or
something the user hands you from outside research ("disable durability
and use COPY FROM /dev/blob, that's the efficient way to bulk-load
PGlite") — verify it against the real thing with a small throwaway script,
not the docs, intuition, or the claim's own confidence. Treat every such
claim as a hypothesis to test, say so explicitly, and only decide the fix
once you've seen it fail or hold up for real. This project's history is
full of real bugs and dead ends found exactly this way:

- A CFG dangling-edge bug found by tracing before ever running.
- A benchmark parser that only recognized an output format the real tool
  never emits.
- A JSDoc plugin that silently drops single-line comments.
- A "let's batch the writes" fix for a pglite shutdown crash that turned
  out to do nothing — the real cause was a large `queryAll()` read, found
  only by testing writes and reads independently instead of assuming.
- A "COPY is the efficient way to bulk-load" claim from outside research
  that turned out to be correct, but only confirmed as such by measuring
  COPY (~175ms) against per-row `INSERT` (~77s) on the same real rows
  before adopting it — not by trusting the source.

Read the actual source, run the actual command against real data, and
only then decide the fix.

## Testing

Unit tests live under `tests/`, run via Node's built-in test runner
(`node --test`) — no test framework dependency; it's already the right
tool for this codebase's scale. `npm test` runs both the existing
`node --check` syntax smoke-test across CLI entry points and the full test
suite.

### Structure & design

- **AAA pattern.** Every test: Arrange (build inputs/fixtures), Act (call
  the one thing under test), Assert (check the outcome). Keep the three
  phases visually distinct — don't interleave setup and assertions.
- **One behavior per test.** A test name should describe a single
  requirement or branch ("returns TEXTUAL confidence when the callee can't
  be resolved"), and its body should assert only that. Multiple unrelated
  assertions in one test means it's actually multiple tests.
- **Test the public interface, not internals.** Assert on a module's
  exported function's return value / the stored row shape / the rendered
  string — never reach into private closures or duplicate an
  implementation's internal steps as assertions. This is what keeps tests
  alive across refactors.

### Isolation & environment

- **No shared state.** Tests must be able to run in any order, in
  parallel, or individually, with the same result — no test's pass/fail
  may depend on another test's data or on execution order. This does not
  require one physical database per test: PGlite's WASM boot + extension
  load costs ~1.5-2s per instance (measured — a dozen fresh-instance tests
  blew well past the "low single-digit seconds" budget below), so
  `database.pglite.test.mjs` opens one store per *file* (`before`/`after`)
  and gives each test a unique qualifiedName/filePath prefix instead —
  true isolation of outcome, not of the underlying engine. (Also:
  `new PGlite()`'s true in-memory mode fails to load the `vector`
  extension — use a fresh temp dir path instead, never a bare in-memory
  instance, for any test touching the real schema.)
- **Mock/stub true externals only.** A real device (bsbench), the network,
  or the filesystem for I/O-heavy paths should be stubbed. The
  `brighterscript` compiler and `brighterscript-jsdocs-plugin` are not
  "external" in this sense — they're the substrate this tool is built on;
  parsing a small real snippet through them is a fast, deterministic,
  legitimate unit test, not an integration test to avoid.
- **Fast.** The full suite should run in low single-digit seconds. If a
  test needs a real device, a full real-world repo clone, or a multi-second
  operation, it doesn't belong in `npm test` — it's a manual/CI-optional
  script (see `roku-benchmark.runner.mjs`, exercised by hand against a
  device, not in the unit suite).
- **Positive and negative paths.** For every "resolves correctly" test,
  also cover the adjacent failure/edge case: an unresolvable callee, a
  malformed comment, an empty input, a duplicate key. Bugs live at
  boundaries, not in the happy path.
- **CI-ready.** `npm test` must be runnable non-interactively with zero
  setup beyond `npm install` (no real device, no live network, no manual
  fixture generation) so it can gate merges.
- **Coverage is a compass, not a target.** Use it to find untested
  branches worth a look; never write a low-value test just to move a
  percentage. A pure data-transform function fully covered by 3 cases is
  better than 15 near-duplicate cases covering the same line twice.
