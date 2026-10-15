# CLAUDE.md

npm-workspaces monorepo. Workspace roots are the `workspaces` globs in [package.json](package.json).

## Conventions

Load the `skills-monorepo:monorepo-conventions` skill before doing any of the following. It has the full steps.

- **New workspace package:** any new folder that matches a `workspaces` glob. Name it `@<scope>/<folder>`, where the scope is the workspace root made singular (`src/apps/example` → `@app/example`). Add a root passthru script `"app:example": "npm run --workspace @app/example --"`.
- **Shared package names:** a package another repo consumes, or that gets published, is `@px-petals/<area>.<name>` (`@px-petals/shell.ws-run`). The root is `@px-petals/<repo-name>`: rename the template's `@px-petals/org.template` in a new repo.
- **Temporary / ignored files:** put them in `.artifacts/<kind>/` (`dist`, `cache`, `coverage`, `logs`, `tmp`), in the package's own folder or at the repo root. Never use a sibling `dist/`, `build/`, or `out/` folder.
- **Package layout:** no loose code files at a package root. Code lives in `src/`. The root holds only `package.json`, `readme.md`, `tsconfig.json`, dot-folders, and tool config files.
- **Other org repositories:** depend on the provider repository's **root**, never a submodule or a `file:` path: `"@px-petals/web.toolkit": "github:pixel-petals/web.toolkit"`. Import its shared packages by their own names (`@px-petals/web.config/eslint`, `ws-run` from `@px-petals/shell.ws-run`); never put a sub-package name in `package.json`, since npm would look it up on the registry. Org install-script warnings are expected; don't add `allowScripts` for org repositories.
- **metapak plugin:** `"metapak": { "configs": [ "main" ] }` with the `@px-petals/metapak-dependencies` (`github:pixel-petals/.dependencies`) and `metapak` devDependencies keeps the `github:` specs, `@px-petals/tools.packager`, the `dependencies` script (`packager link`), `allow-git=all` in `.npmrc` and the `package-local.json` ignore rule in step. Run `npm run metapak` after changing an org dependency, then `npm install`. It moves its key to the top of `package.json` and drops the final newline; leave both. CI runs it, and it exits 1 on drift there.
- **Providers:** a repository whose workspace packages other repositories use lists `[ "main", "provider" ]`, names those packages in `"packager": { "hoist": [ "<glob>", "!<excluded>" ] }` (root-only entries in `packager.root`), has a `version`, and commits what `npm run hoist` writes into the root `package.json`. CI also runs `hoist:check`.
- **Sibling checkouts:** a git-ignored `package-local.json` links provider roots to local checkouts instead of the GitHub copies. `packager scan` writes it (`npm run scan --prefix <workspace>` from the umbrella workspace), then `npm install`; after a hand edit, `npx packager link`. Never commit it.
- **Third-party submodules:** code from outside the org goes in `src/.submodules/<name>` (`git submodule add -f`). Run `git submodule update --init --recursive` after cloning or bumping one. Never add an org repository as a submodule.
- **Workspace file:** `package.code-workspace` opens the repo root plus every third-party submodule at any depth, one folder per repository at its shallowest path. Rename the template's `.template` root folder in a new repo, and add or remove a folder whenever a submodule is added or removed. Org repositories are not listed.
- **Import aliases:** use Node `#` subpath imports declared in the package's `package.json` `imports` field. Never use tsconfig `paths` or bundler aliases.

## JavaScript

Load the `skills-monorepo:javascript` skill before writing or reviewing `.js` files or any `tsconfig.json`.

- **Style:** no semicolons, single quotes, `.js` only (all ESM), and `#private` class members.
- **Types through JSDoc:** source is plain JS, typed with JSDoc (`@import`, `@typedef`, `@param`). Use `.d.ts` only for what JSDoc cannot express.
- **Loose checking:** `strict: false` and `skipLibCheck: true`. Don't tighten either per package.
- **Shared tsconfig and ESLint:** compiler options and lint rules come from `@px-petals/web.config`, a shared package of the `@px-petals/web.toolkit` dependency. The root [tsconfig.base.json](tsconfig.base.json) extends it, adding only `exclude`, and [eslint.config.js](eslint.config.js) builds on its `config()`. Each package's `tsconfig.json` extends the root base and adds only its own `include` and environment settings.
- **Tests:** Vitest, with `*.test.js` in a `.tests/` folder beside the code. Tests are type-checked too.
- **Folders:** each cluster has an `index.js` barrel. `.poc/` and `.features/` are dot-prefixed so barrels skip them.
- **Scripts:** `npm run typecheck` and `npm test` run in every workspace through `ws-run` (`@px-petals/shell.ws-run`, from the `@px-petals/shell.toolkit` dependency), which skips while there are none. `npm run lint` runs ESLint once from the root.

## Docs

Load the `skills-monorepo:docs` skill before writing or moving any markdown doc.

- **Collocated:** docs live beside the code they describe. `readme.md` is the folder's entry point, `<file>.md` holds docs specific to one file, and `.docs/` holds assets, diagrams, and further docs. Docs about the repo as a whole are handwritten in `src/.docs/`, with `readme.md` the only doc at the repo root.
- **Dot-prefixed:** at every depth, a docs folder is `.docs/` and a tests folder is `.tests/`, never `docs/` or `tests/`. They sort above the code in a folder listing.

## CI/CD

Load the `skills-monorepo:github-ci` skill before creating or editing anything under a `.github/` folder.

- **Shared first:** generic actions and reusable workflows live in `pixel-petals/.devops`. Set up with its `setup` action, which fetches private org repositories; list every one the install fetches, transitively (providers, `tools.packager`, `.dependencies`), in its `repositories` input. Check `metapak` in every repository, and `hoist:check` in a provider. Write a local action only for what this repository alone needs.
- **Workflows compose actions:** a workflow is wiring only, made of `uses:` steps. It has no `run:` steps. If a job needs a script, write an action for it.
- **Sidecar scripts:** an action's `run:` steps only call a script beside its `action.yml` (`action.sh`, or `action.<step>.sh`). Pass inputs through `env:`, never by interpolating `${{ inputs.* }}`.

## Editor

Load the `skills-monorepo:vscode-sync` skill whenever a `package.json` script is added, renamed, removed, or changed.

- **Scripts are the source of truth:** `.vscode/launch.json` and `tasks.json` only call npm scripts and never inline a command.
- **Keep them in sync:** after any script change, update the launch configs, tasks, compounds, and `dependsOn` lists that refer to it.
- **Compounds:** a project with more than one long-running script gets a `<project>: everything` compound that starts them all, dev tools like Storybook included, so nobody has to remember what to turn on. Problem-only watchers such as `tsc --watch` run as folder-open tasks instead.

## This repository

Project-specific rules for working in `roku-graphify` (`src/tools/lang-graph`), from before the repo followed the org template. These are binding — follow them even under context pressure or mid-refactor; don't let them drift out of a long session.

### Naming convention

Every file: `<cluster>.<scope>.<ext>`, where `<cluster>` matches its containing directory (e.g. `src/tools/lang-graph/src/parse/roku-app/roku-app.brs.mjs`, `src/tools/lang-graph/src/parse/jsdoc/jsdoc.extract.mjs`). The tool's source is still `.mjs`, not yet the `.js` the JavaScript section above asks for. A new cluster is a new subdirectory with its own prefix, not a loose file bolted onto an existing one.

### Code style

- **Composition > Inheritance.** Composition is a more robust, flexible architecture.
- **YAGNI first.** Don't add features, refactor, or introduce abstractions beyond what the task requires. A bug fix doesn't need surrounding cleanup; a one-shot operation doesn't need a helper. Don't design for hypothetical future requirements — three similar lines beat a premature abstraction, and a declarative lookup table beats a `switch` when the cases are just data (see `jsdoc.snippets.mjs`).
- **No speculative robustness.** Don't add error handling, fallbacks, or validation for scenarios that can't happen. Trust internal code and framework guarantees; only validate at real system boundaries (user input, external APIs, a third-party library that's known to throw).
- **Comments: WHY, not WHAT.** Default to no comments. Only add one when the reasoning isn't visible in the code itself — a hidden constraint, a workaround for a specific verified bug, a non-obvious invariant. Never restate what well-named code already says, never reference "the current fix" or a specific past conversation (comments outlive the session that wrote them). **Watch for literal `*/` inside a block comment's prose** — it terminates the comment early and breaks the file. Hit repeatedly this session (e.g. writing "ro*/if*-prefixed" to mean "ro- or if-prefixed"). Reword around it; never let the two-character sequence appear in comment text for any reason.
- **Ponytail bias**: prefer stdlib/native platform features over new dependencies, and a new dependency over hand-rolled code that duplicates what a well-known library already does correctly (e.g. reusing `brighterscript-jsdocs-plugin`'s comment parsing rather than reimplementing BrightScriptDoc tag parsing from scratch).
- Mark a deliberate shortcut with a `// ponytail: <what/why/upgrade-path>` comment rather than silently leaving it unexplained.

### Frontend organization

Rules for browser-facing code (currently `src/tools/lang-graph/src/db-graph`), informed by reviewing how `web/VTT-database/main` (a sibling project) organizes its frontend, and by a hand-rolled HTML/CSS/JS generator (`db-graph.html.mjs`) that grew unmaintainable enough to be worth writing this section over.

- **No dangling top-level side effects.** A module that does *application* work the moment it's imported — builds live objects and wires them together, attaches a DOM listener via `document.getElementById`, mutates shared state — is a trap for whoever imports it next; they have no way to know it's about to run. Every app gets exactly one **composition root**: the file its `index.html` loads directly (e.g. `db-graph/app/app.root.mjs`). Only that file gets to do that kind of top-level wiring. Every other module exports functions/classes and does nothing *behavioral* on import. `customElements.define('tag-name', MyElement)` at the bottom of a component's own file is the one standard exception, not a violation of this rule — it's inert declaration (register a name, do nothing until something actually instantiates the tag), exactly as unsurprising as `export class MyElement`, and it's how every real Lit/web-components project registers components (the `@customElement()` decorator does the literal same thing; we just spell it without a compiler).
- **Sub-cluster when a cluster grows a second concern.** The naming convention above already says "a new cluster is a new subdirectory, not a loose file bolted onto an existing one" — this applies *within* a cluster too. Once a directory's files split into clearly distinct groups (e.g. `db-graph`'s `editor` side vs its `viewer` side), each group gets its own subdirectory (`db-graph/editor/`, `db-graph/viewer/`), not files dangling at the parent cluster's root next to each other.
- **Real files for real code, every time.** HTML, CSS, and JS each get their own file with the matching extension. A framework component's template/styles defined via tagged template literals *inside* a `.mjs`/`.js` file (Lit's `html`/`css`) is fine — editors have real syntax highlighting for those. What's never fine: building a page, or a whole component, as a hand-concatenated string blob of raw markup. The one legitimate exception is a small, genuinely dynamic *leaf* fragment (a data-driven list item) built as a template literal — reserve it for that, not for structure.
- **When to reach for a bundler.** Gluing together one or two UMD libraries via CDN `<script>` is a reasonable zero-build-step choice for that shape of problem. Once you're authoring a real multi-file component-framework app, hand-rolling the "stitch these files together" step is reinventing a bundler — use one (this project's precedent: Vite, matching `web/VTT-database/main`'s own choice).
- See the `lit-app-structure` skill for Lit-specific guidance (when to reach for `@lit/context` vs `@lit-labs/signals` vs `@lit-labs/observers` vs `@lit-labs/motion` vs `@lit-labs/router`, and the SSR/hydration pattern used by `db-graph`'s CLI).

### Verification discipline

Before implementing or recommending a fix based on a technical claim — whether it's an architectural assumption about a third-party dependency ("pglite should handle this," "the plugin parses X correctly"), a performance hypothesis ("batching the writes should fix the crash"), or something the user hands you from outside research ("disable durability and use COPY FROM /dev/blob, that's the efficient way to bulk-load PGlite") — verify it against the real thing with a small throwaway script, not the docs, intuition, or the claim's own confidence. Treat every such claim as a hypothesis to test, say so explicitly, and only decide the fix once you've seen it fail or hold up for real. This project's history is full of real bugs and dead ends found exactly this way:

- A CFG dangling-edge bug found by tracing before ever running.
- A benchmark parser that only recognized an output format the real tool never emits.
- A JSDoc plugin that silently drops single-line comments.
- A "let's batch the writes" fix for a pglite shutdown crash that turned out to do nothing — the real cause was a large `queryAll()` read, found only by testing writes and reads independently instead of assuming.
- A "COPY is the efficient way to bulk-load" claim from outside research that turned out to be correct, but only confirmed as such by measuring COPY (~175ms) against per-row `INSERT` (~77s) on the same real rows before adopting it — not by trusting the source.

Read the actual source, run the actual command against real data, and only then decide the fix.

### Testing

Unit tests live in `src/tools/lang-graph/src/.tests/`, run via Node's built-in test runner (`node --test`) rather than the Vitest the JavaScript section above names — no test framework dependency; it's already the right tool for this codebase's scale. The package's `test` script (`npm test` from the root, through `ws-run`) runs both the existing `node --check` syntax smoke-test across CLI entry points and the full test suite.

#### Structure & design

- **AAA pattern.** Every test: Arrange (build inputs/fixtures), Act (call the one thing under test), Assert (check the outcome). Keep the three phases visually distinct — don't interleave setup and assertions.
- **One behavior per test.** A test name should describe a single requirement or branch ("returns TEXTUAL confidence when the callee can't be resolved"), and its body should assert only that. Multiple unrelated assertions in one test means it's actually multiple tests.
- **Test the public interface, not internals.** Assert on a module's exported function's return value / the stored row shape / the rendered string — never reach into private closures or duplicate an implementation's internal steps as assertions. This is what keeps tests alive across refactors.

#### Isolation & environment

- **No shared state.** Tests must be able to run in any order, in parallel, or individually, with the same result — no test's pass/fail may depend on another test's data or on execution order. This does not require one physical database per test: PGlite's WASM boot + extension load costs ~1.5-2s per instance (measured — a dozen fresh-instance tests blew well past the "low single-digit seconds" budget below), so `pglite.db.test.mjs` opens one store per *file* (`before`/`after`) and gives each test a unique qualifiedName/filePath prefix instead — true isolation of outcome, not of the underlying engine. (Also: `new PGlite()`'s true in-memory mode fails to load the `vector` extension — use a fresh temp dir path instead, never a bare in-memory instance, for any test touching the real schema.)
- **Mock/stub true externals only.** A real device (bsbench), the network, or the filesystem for I/O-heavy paths should be stubbed. The `brighterscript` compiler and `brighterscript-jsdocs-plugin` are not "external" in this sense — they're the substrate this tool is built on; parsing a small real snippet through them is a fast, deterministic, legitimate unit test, not an integration test to avoid.
- **Fast.** The full suite should run in low single-digit seconds. If a test needs a real device, a full real-world repo clone, or a multi-second operation, it doesn't belong in `npm test` — it's a manual/CI-optional script (see `roku-benchmark.runner.mjs`, exercised by hand against a device, not in the unit suite).
- **Positive and negative paths.** For every "resolves correctly" test, also cover the adjacent failure/edge case: an unresolvable callee, a malformed comment, an empty input, a duplicate key. Bugs live at boundaries, not in the happy path.
- **CI-ready.** `npm test` must be runnable non-interactively with zero setup beyond `npm install` (no real device, no live network, no manual fixture generation) so it can gate merges.
- **Coverage is a compass, not a target.** Use it to find untested branches worth a look; never write a low-value test just to move a percentage. A pure data-transform function fully covered by 3 cases is better than 15 near-duplicate cases covering the same line twice.
