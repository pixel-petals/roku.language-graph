
# Database Graph

Visualization for graph databases.

`db-graph` is a Lit web-components app, organized per CLAUDE.md's "Frontend organization" rules: a `viewer/` cluster and an `editor/` cluster, each a handful of small single-purpose components, composed together by one composition root (`db-graph.app.mjs`). It's broken into two conceptual tools: [[#Viewer]] and [[#Editor]].

## Architecture

Plain JS, no TypeScript, no decorators (`static properties` instead of `@property()`) — matches the rest of this codebase, and every Lit/lit-labs package used here has a documented non-decorator API.

**Built with Vite** (`db-graph.vite.config.mjs`, `vite-plugin-singlefile`): authored as real multi-file components with real syntax highlighting/intellisense, bundled+inlined back into one shippable HTML file at build time. This supersedes the project's earlier "CDN `<script>` tags, no bundler" choice for `db-graph` specifically — that was right for gluing together one or two UMD libraries, but hand-rolling "stitch these many files together" for a real component framework app is reinventing a bundler badly. See the `lit-app-structure` skill for the general rule.

**`npm run build:db-graph`** (`vite build --config src/db-graph/db-graph.vite.config.mjs`) produces `.build/db-graph/index.html` (gitignored): one file, JS+CSS fully inlined, containing an **empty** `<db-graph-app></db-graph-app>` placeholder. This build is data-independent — a reusable shell, rebuilt only when component source changes, not per database.

**SSR + splice** (`db-graph.ssr.mjs`, Node-only): per CLI invocation,
- Imports `db-graph.app.mjs` directly (resolves via `node_modules`, since `lit`/`@lit/context`/etc. are real dependencies now) and uses `@lit-labs/ssr`'s `render()` + `collectResult()` to render `<db-graph-app .rawData=${rawData}>` — seeded with that database's `queryAll()` result — to an HTML string with declarative shadow roots.
- Embeds that seed data as a `<script type="application/json" id="db-graph-raw-data">` tag alongside the rendered markup. **Property bindings only affect SSR's output** — the input value itself is never serialized into the page, so without this the client has no way to know what data produced the markup it's hydrating; `DbGraphApp`'s constructor reads this same tag back out client-side. (A real gotcha, not hypothetical — found by reproducing it: without the script tag, every client-side render silently used the constructor's empty-array default instead of the real data.)
- Splices the rendered markup into the built shell in place of the empty placeholder and writes the result to `--out` — **still one `.html` file**, same CLI contract as before.
- `npm run view-graph` chains `build:db-graph` first so `npm run view-graph -- <path>` works standalone; the bare `node src/cli/cli.view-graph.mjs` errors with a clear message if the shell is missing, rather than silently shelling out to Vite.

**What SSR actually buys here**: the app shell — panel structure, headers, the stats readout's real initial counts computed from that database's data — appears in the HTML before any client JS runs. It does **not** pre-render the G6/LiteGraph canvas pixels themselves; those stay imperative, client-only, post-hydration (`firstUpdated`/`updated` don't run under `@lit-labs/ssr` by design — verified directly, not assumed).

**G6 and litegraph.js are real npm imports**, bundled by Vite like everything else — the CDN-script era's "no bundler exists yet" premise no longer holds now that Vite is in the picture anyway. Bonus: the shipped file is now fully offline (no unpkg fetch at runtime).

### File layout

```
src/db-graph/
  spec.md
  index.html                Vite entry: <db-graph-app></db-graph-app> + one
                             <script type="module"> importing db-graph.app.mjs
                             — the ONE allowed composition root
  db-graph.vite.config.mjs  Vite config (root=src/db-graph, outDir=../../.build/db-graph,
                             plugins=[viteSingleFile()])
  db-graph.app.mjs          <db-graph-app> — composition root: reads seed data,
                             provides graphData via @lit/context, sets up the
                             #/ #/viewer #/editor router, composes
                             <db-graph-canvas> + <db-graph-editor-panel>
  db-graph.state.mjs        graphDataSignal (@lit-labs/signals) + graphDataContext
                             (@lit/context) — the "model" layer
  db-graph.data.mjs         toGraphData/dirname/basename/nodeFieldValue — shared
                             by editor (Render Graph node) and viewer; zero
                             Node-specific deps
  db-graph.ssr.mjs          Node-only: SSR-render + splice (see above)
  editor/
    editor.panel.mjs         <db-graph-editor-panel> — hosts the LiteGraph canvas,
                              collapse/expand + full-width via @lit-labs/motion's
                              `animate` directive, sizes via @lit-labs/observers'
                              ResizeController
    editor.node-types.mjs    Plain module: registers the 6 LiteGraph node types
                              against a given LGraph
    editor.pipeline.mjs      Pure functions behind Filter Nodes/Edges: matchesFilter,
                              valueOptionsFor, summarizeValues, fieldValueOf —
                              unit-tested (tests/editor.pipeline.test.mjs)
    editor.value-picker.mjs  <db-graph-value-picker> — the tag-cloud autocomplete,
                              a real Lit component (options/selected properties,
                              value-changed/close events)
  viewer/
    viewer.canvas.mjs        <db-graph-canvas> — owns the G6 Graph instance
                              lifecycle, consumes graphDataSignal
    viewer.stats.mjs         <db-graph-stats> — node/edge/group-count readout,
                              takes graphData as a plain property from its direct
                              parent (not its own signal subscription — see below)
tests/
  db-graph.data.test.mjs
  editor.pipeline.test.mjs
```

## Viewer

`<db-graph-canvas>` owns the G6 `Graph` instance: destroy+recreate on every pipeline run (not diffed in place) — combo/palette config only take effect at construction, and this graph is small enough (hundreds, not tens of thousands, of nodes) that a rebuild per run is simpler than chasing G6's dynamic-option-update surface for a case this size doesn't need. Sized via `@lit-labs/observers`' `ResizeController`.

Rendered graph features:
- Nodes cluster into a combo per containing folder by default (`combo-combined` layout, `force` layout within/between combos and at the root, driven by the pipeline's default Cluster Nodes node).
- Pan/zoom/drag, combo collapse/expand (double-click) via G6's built-in behaviors.
- Nodes colored by whatever field the pipeline's Color Nodes By node picks (`kind` by default) with an auto-generated legend.
- Edges colored/dashed by `confidenceTier` (`DECLARED` gray, `RESOLVED` blue solid, `TEXTUAL` orange dashed) — fixed, not yet pipeline-configurable.
- Hover tooltip showing a node's kind/qualifiedName/file:line, or an edge's kind/endpoints/file:line/confidence.

**`<db-graph-stats>` takes `graphData` as a plain property**, not its own `graphDataSignal` subscription, even though `SignalWatcher` would seem like the obvious fit (per the `lit-app-structure` skill: direct parent-child data doesn't need context/signals). This isn't just a style preference — using `SignalWatcher` here hit a real `@lit-labs/ssr` hydration bug: `db-graph-canvas` (which does read the signal directly, since it's the actual data owner) re-rendered correctly after hydration, but `db-graph-stats`'s own `SignalWatcher`-driven update silently failed to patch its text into the DOM the first time real data replaced the SSR default — no error, just frozen text, reproduced directly by comparing the two components' behavior. A second, related hydration bug: the stats template must render as **one** interpolated part (`html\`${text}\`` built from a single JS string), not several adjacent parts — a part whose SSR value is an empty string that later becomes non-empty (the "N groups" suffix, empty until the pipeline runs) never hydrates correctly either. Both are real, reproduced gotchas in an explicitly experimental package, not assumptions — worth revisiting if a newer `@lit-labs/ssr` fixes empty-string/multi-part hydration.

## Router

`#/` (split view, default) / `#/viewer` (editor panel hidden) / `#/editor` (viewer hidden, editor full-width) — deep-linkable, real payoff: `db-graph.html#/editor` opens straight into the editor, and back/forward navigates between view modes.

**Hash-based, not `@lit-labs/router`'s `Router` class.** `Router` is pathname+`pushState` based (installs global `click`/`popstate` listeners, calls `goto(location.pathname)` — see its source) which doesn't fit a page generated once and often opened via `file://` with no server to own routing. The lower-level `Routes` controller (`@lit-labs/router/routes.js` — **must** be imported from this subpath, not the package root: the root barrel also re-exports `Router`, whose module touches `location` at top-level and crashes under Node/SSR, verified directly) just matches whatever string you hand `goto()` against its `URLPattern` configs, so a plain `hashchange` listener adapts it to hash navigation — same route-matching/outlet machinery, different trigger.

## Editor

Node-based editor (LiteGraph.js — the same interaction model as Blender's shader/geometry nodes: typed sockets, drag-to-connect wires, double-click search to add a node) that lets users configure how nodes, edges, and clusters are formed, filtered, and rendered.

### Node types

All registered under plain display names (not a `"category/name"` namespace) — LiteGraph's add-node search box displays a node's raw registered type string verbatim, not its `.title`, so a namespaced type would search/display badly. The default library (math/audio/3d/network nodes, plus a parallel "searchbox extras" registry for things like `MAX`/`==`) is unregistered at setup so the search only ever offers these six:

- **Graph Source** — no inputs; outputs this view's raw `nodes`/`edges` (the GraphStore's `queryAll()` result).
- **Filter Nodes** / **Filter Edges** — input + output of the same kind; widgets `field` (combo), `operator` (`is` / `is not` / `is one of` / `is not one of` / `contains`), and `value` (see tag-cloud picker below). An empty value list is a no-op filter (passes everything through) so adding the node doesn't blank the graph before it's configured.
- **Cluster Nodes** — input/output `nodes`, plus a `comboField` output; widget `field` (`folder` / `kind` / `parentName` / `language` / `(none)`).
- **Color Nodes By** — input/output `nodes`, plus a `paletteField` output; widget `field` (same options as Filter Nodes' field, minus `(none)`).
- **Build UML Classes** — input/output `nodes`/`edges`; folds `Method`/`Field`/`ComponentFunction`/`ComponentField` members into their owning `Class`/`Interface`/`Component` (walking `CONTAINS` ownership, so nested owners like a method's basic blocks still resolve to the right class) and reclassifies inter-class edges into UML relation kinds (`EXTENDS` → `INHERITANCE`, `INSTANTIATES` → `COMPOSITION`, `CALLS`/`READS`/`WRITES`/`USES`/`USES_TYPE`/`IMPORTS_FROM`/`HAS_SCRIPT`/`OBSERVES` → `DEPENDENCY`, anything else → `ASSOCIATION`), retargeting member-level edges up to their class and deduplicating same-pair-same-relation edges to the highest-confidence one. Pure logic lives in `editor/editor.uml.mjs` (unit-tested, `tests/editor.uml.test.mjs`), independent of the LiteGraph wiring.
- **Render Graph** — terminal node, no outputs; inputs `nodes`, `edges`, `comboField`, `paletteField`. Calls `toGraphData()` and writes the result to `graphDataSignal`.

The default graph wires **Graph Source → Cluster Nodes (`field: folder`) → Render Graph**, with Source's `edges` going straight to Render (unfiltered) — "cluster by folder, show everything." Wiring **Graph Source → Build UML Classes → Render Graph** instead (in place of Cluster Nodes) renders a UML class diagram: the viewer (`viewer/viewer.canvas.mjs`) switches any node carrying a `members` field to a `rect`-typed UML class box (stereotype, name, a divider, then up to 8 fields/methods each — a longer list collapses to "… and N more" so one dense class can't blow out the force layout's spacing for its neighbors) instead of the default circle, and styles `INHERITANCE`/`COMPOSITION`/`DEPENDENCY`/`ASSOCIATION` edges by arrowhead shape and dash (hollow triangle / filled diamond / dashed vee / solid vee) rather than by hue, matching real UML convention that relationship *shape* carries the meaning, not color. `Filter Nodes`/`Filter Edges` can still sit before or after Build UML Classes to narrow which classes or relations end up on the diagram.

### Execution model

Event-driven, not a running animation loop: `graph.onConnectionChange` / `onNodeAdded` / `onNodeRemoved`, plus every widget's own change callback, call a `requestAnimationFrame`-debounced `scheduleRun()` that does exactly one `graph.runStep()` — LiteGraph's own single-pass topological execution (`onExecute` on every node once, in dependency order). No polling, no continuous redraw.

### Tag-cloud autocomplete (Filter Nodes/Edges' `value` widget)

A filter's `value` must match real data — `kind`, `confidenceTier`, etc. are closed vocabularies pulled from whatever's actually flowing into that node at that point in the pipeline, not free text a user could typo. The `value` widget is a `"button"`-type LiteGraph widget (canvas-drawn label only); clicking it creates a real `<db-graph-value-picker>` Lit component (`editor.value-picker.mjs`), positioned at the click, appended to `document.body`:

- Reads the node's *live upstream* data (`node.getInputData(0)`) and computes `{ value, count }` for every distinct value of the currently selected `field` — so the cloud always reflects what's actually reachable through the pipeline up to that node, not the whole database.
- Renders each as a chip (`value (count)`), sorted by frequency; a search input live-filters the chips by substring.
- Clicking a chip toggles it into/out of the filter's selected-value set (`value-changed` event); multiple chips can be selected (`is one of` / `is not one of`).
- Click-outside or Escape closes it (`close` event; the owning module removes the element).

A DOM/Lit component rather than a canvas-drawn LiteGraph widget: LiteGraph widgets are cheap to draw but not built for hit-testing/scrolling/typing/reactive-re-rendering a filterable list, and this needs all four. `LiteGraph.ContextMenu` (what the built-in `"combo"` widget type opens) was considered and rejected — it has no search/filter input, so it doesn't satisfy "autocomplete" for fields with more than a handful of values (e.g. `filePath`).

### Known LiteGraph gotchas (fixed, worth remembering)

- Custom LiteGraph node constructors do **not** get `this.properties` for free — `LiteGraph.registerNodeType()` only copies `LGraphNode.prototype` methods onto the custom class, it never runs the `LGraphNode` constructor. Any node touching `this.properties` (both Filter node types, via the tag-cloud widget) must initialize `node.properties = node.properties || {}` itself.
- `openValuePicker`'s `selected` value must be a plain array (matching `db-graph-value-picker`'s own `.includes()`/spread-based `#toggle` logic), not a `Set` — a leftover from an earlier DOM-manipulation-based version of the picker that used `Set` methods (`.has()`/`.add()`).

Both found by actually driving the flow in a headless browser and hitting real `TypeError`s on first use, not by reading docs.

## Verification

Every scenario below was checked with zero console/page errors, against a real app's graph (`examples/roku-app`, 611 nodes/954 non-dangling edges/9 folders) rendered through the real CLI (`npm run view-graph:app`), not a hand-rolled substitute:
- Default pipeline render (SSR shell + client hydration + G6/LiteGraph paint).
- Adding a Filter Nodes node via the search box, wiring it into the pipeline, opening its tag-cloud picker, searching, selecting a value, confirming the render drops to the correct filtered node/edge count (56 nodes/28 edges for `kind = Function`).
- `#/`, `#/viewer`, `#/editor` hash navigation, including the LiteGraph canvas recentering correctly after a large width change between modes.
- Rewiring the pipeline to Graph Source → Build UML Classes → Render Graph and confirming the correct class/relation count (9 classes/5 relations for this app's Component graph) and that UML class boxes/relation arrows actually paint (not just that the node/edge counts match).
