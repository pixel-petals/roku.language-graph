/**
 * editor.node-types.mjs
 *
 * Registers the db-graph node-editor's LiteGraph node types (Graph Source /
 * Filter Nodes / Filter Edges / Cluster Nodes / Color Nodes By / Render
 * Graph) and builds the default pipeline. Plain module, not a Lit
 * component — LiteGraph owns its own canvas rendering, so there's nothing
 * here for Lit to manage; editor.panel.mjs is the actual component and
 * calls setupPipeline() once it has a canvas element to hand LiteGraph.
 *
 * Registered under plain display names (not a "category/name" namespace):
 * LiteGraph's add-node search box displays a node's raw registered type
 * string verbatim, not its `.title`, so a namespaced type would search and
 * display badly.
 */
import { LiteGraph, LGraph, LGraphCanvas } from 'litegraph.js';
import { toGraphData } from '../db-graph.data.mjs';
import { matchesFilter, valueOptionsFor, summarizeValues, NODE_FIELDS, EDGE_FIELDS, CLUSTER_FIELDS, OPERATORS } from './editor.pipeline.mjs';
import { buildUmlClasses, classifyUmlEdges, DEFAULT_CLASS_KINDS } from './editor.uml.mjs';
import './editor.value-picker.mjs';

const OUR_TYPES = ['Graph Source', 'Filter Nodes', 'Filter Edges', 'Cluster Nodes', 'Color Nodes By', 'Build UML Classes', 'Render Graph'];

function openValuePicker({ x, y, options, selected, onChange }) {
  document.querySelector('db-graph-value-picker')?.remove();
  const picker = document.createElement('db-graph-value-picker');
  picker.x = x;
  picker.y = y;
  picker.options = options;
  picker.selected = selected;
  picker.addEventListener('value-changed', (e) => onChange(e.detail));
  picker.addEventListener('close', () => picker.remove(), { once: true });
  document.body.appendChild(picker);
}

/**
 * @param {HTMLCanvasElement} canvasEl
 * @param {{nodes: object[], edges: object[]}} rawData a GraphStore's queryAll() result
 * @param {(graphData: object) => void} onRender called with the pipeline's
 *   { nodes, edges, combos, paletteField } every time it runs
 */
export function setupPipeline({ canvasEl, rawData, onRender }) {
  let pendingRun = false;
  function scheduleRun() {
    if (pendingRun) return;
    pendingRun = true;
    requestAnimationFrame(() => { pendingRun = false; graph.runStep(); });
  }

  function addValuePickerWidget(node, fieldOf) {
    // Custom node constructors (unlike LGraphNode itself) don't get
    // `this.properties` for free — registerNodeType only copies prototype
    // methods, it never runs the LGraphNode constructor for us.
    node.properties = node.properties || {};
    node.properties.value = [];
    const widget = node.addWidget('button', 'value', '(any)', (w, canvas, n, pos, event) => {
      const upstream = node.getInputData(0) || [];
      const options = valueOptionsFor(upstream, fieldOf());
      openValuePicker({
        x: event.clientX, y: event.clientY, options, selected: node.properties.value,
        onChange: (values) => {
          node.properties.value = values;
          widget.value = summarizeValues(values);
          canvas.setDirty(true, true);
          scheduleRun();
        },
      });
    });
    return widget;
  }

  function FilterNodesNode() {
    this.addInput('nodes', 'nodes');
    this.addOutput('nodes', 'nodes');
    this.fieldWidget = this.addWidget('combo', 'field', 'kind', () => {
      this.properties.value = [];
      this.valueWidget.value = '(any)';
      scheduleRun();
    }, { values: NODE_FIELDS });
    this.operatorWidget = this.addWidget('combo', 'operator', 'is one of', () => scheduleRun(), { values: OPERATORS });
    this.valueWidget = addValuePickerWidget(this, () => this.fieldWidget.value);
  }
  FilterNodesNode.title = 'Filter Nodes';
  FilterNodesNode.desc = 'Keeps only nodes matching field/operator/value';
  FilterNodesNode.prototype.onExecute = function () {
    const nodes = this.getInputData(0) || [];
    this.setOutputData(0, nodes.filter(n => matchesFilter(n, this.fieldWidget.value, this.operatorWidget.value, this.properties.value)));
  };
  LiteGraph.registerNodeType('Filter Nodes', FilterNodesNode);

  function FilterEdgesNode() {
    this.addInput('edges', 'edges');
    this.addOutput('edges', 'edges');
    this.fieldWidget = this.addWidget('combo', 'field', 'kind', () => {
      this.properties.value = [];
      this.valueWidget.value = '(any)';
      scheduleRun();
    }, { values: EDGE_FIELDS });
    this.operatorWidget = this.addWidget('combo', 'operator', 'is one of', () => scheduleRun(), { values: OPERATORS });
    this.valueWidget = addValuePickerWidget(this, () => this.fieldWidget.value);
  }
  FilterEdgesNode.title = 'Filter Edges';
  FilterEdgesNode.desc = 'Keeps only edges matching field/operator/value';
  FilterEdgesNode.prototype.onExecute = function () {
    const edges = this.getInputData(0) || [];
    this.setOutputData(0, edges.filter(e => matchesFilter(e, this.fieldWidget.value, this.operatorWidget.value, this.properties.value)));
  };
  LiteGraph.registerNodeType('Filter Edges', FilterEdgesNode);

  function ClusterNodesNode() {
    this.addInput('nodes', 'nodes');
    this.addOutput('nodes', 'nodes');
    this.addOutput('comboField', 'field');
    this.fieldWidget = this.addWidget('combo', 'field', 'folder', () => scheduleRun(), { values: CLUSTER_FIELDS });
  }
  ClusterNodesNode.title = 'Cluster Nodes';
  ClusterNodesNode.desc = 'Groups nodes into a combo per distinct value of field';
  ClusterNodesNode.prototype.onExecute = function () {
    this.setOutputData(0, this.getInputData(0) || []);
    this.setOutputData(1, this.fieldWidget.value === '(none)' ? null : this.fieldWidget.value);
  };
  LiteGraph.registerNodeType('Cluster Nodes', ClusterNodesNode);

  function ColorNodesByNode() {
    this.addInput('nodes', 'nodes');
    this.addOutput('nodes', 'nodes');
    this.addOutput('paletteField', 'field');
    this.fieldWidget = this.addWidget('combo', 'field', 'kind', () => scheduleRun(), { values: NODE_FIELDS });
  }
  ColorNodesByNode.title = 'Color Nodes By';
  ColorNodesByNode.desc = 'Sets the field node color is grouped/categorized by';
  ColorNodesByNode.prototype.onExecute = function () {
    this.setOutputData(0, this.getInputData(0) || []);
    this.setOutputData(1, this.fieldWidget.value);
  };
  LiteGraph.registerNodeType('Color Nodes By', ColorNodesByNode);

  function BuildUmlClassesNode() {
    this.addInput('nodes', 'nodes');
    this.addInput('edges', 'edges');
    this.addOutput('nodes', 'nodes');
    this.addOutput('edges', 'edges');
    // Both start folded — a class diagram is easiest to read as a list of
    // class names first, with the viewer's per-box click-to-expand (see
    // viewer.canvas.mjs) opening up only the ones actually being looked at.
    // No Private Functions toggle: the viewer never renders that section at
    // all (see viewer.uml-layout.mjs's UML_SECTIONS), so there'd be nothing
    // for it to control.
    this.properties = { showFields: false, showPublicMethods: false };
    this.addWidget('toggle', 'Properties', this.properties.showFields, v => { this.properties.showFields = v; scheduleRun(); });
    this.addWidget('toggle', 'Public Functions', this.properties.showPublicMethods, v => { this.properties.showPublicMethods = v; scheduleRun(); });
  }
  BuildUmlClassesNode.title = 'Build UML Classes';
  BuildUmlClassesNode.desc = 'Folds Method/Field members into their owning Class/Interface/Component and reclassifies inter-class edges as UML relations (EXTENDS -> INHERITANCE, INSTANTIATES -> COMPOSITION, calls/reads/writes/etc -> DEPENDENCY); the two toggles control whether Properties/Public Functions render expanded or folded to a summary line by default (private functions are never rendered)';
  BuildUmlClassesNode.prototype.onExecute = function () {
    const nodes = this.getInputData(0) || [];
    const edges = this.getInputData(1) || [];
    const { showFields, showPublicMethods } = this.properties;
    const { nodes: classNodes, classIds, ownerMap } = buildUmlClasses({ nodes, edges }, {
      classKinds: DEFAULT_CLASS_KINDS, showFields, showPublicMethods,
    });
    this.setOutputData(0, classNodes);
    this.setOutputData(1, classifyUmlEdges(edges, { classIds, ownerMap }));
  };
  LiteGraph.registerNodeType('Build UML Classes', BuildUmlClassesNode);

  function RenderGraphNode() {
    this.addInput('nodes', 'nodes');
    this.addInput('edges', 'edges');
    this.addInput('comboField', 'field');
    this.addInput('paletteField', 'field');
  }
  RenderGraphNode.title = 'Render Graph';
  RenderGraphNode.desc = 'Terminal node: draws its inputs in the viewer';
  RenderGraphNode.prototype.onExecute = function () {
    const nodes = this.getInputData(0) || [];
    const edges = this.getInputData(1) || [];
    const comboField = this.getInputData(2) ?? null;
    const paletteField = this.getInputData(3) || 'kind';
    onRender({ ...toGraphData({ nodes, edges }, { comboField }), paletteField });
  };
  LiteGraph.registerNodeType('Render Graph', RenderGraphNode);

  function SourceNode() {
    this.addOutput('nodes', 'nodes');
    this.addOutput('edges', 'edges');
  }
  SourceNode.title = 'Graph Source';
  SourceNode.desc = "This view's GraphStore data (read-only)";
  SourceNode.prototype.onExecute = function () {
    this.setOutputData(0, rawData.nodes);
    this.setOutputData(1, rawData.edges);
  };
  LiteGraph.registerNodeType('Graph Source', SourceNode);

  // LiteGraph ships a large default library (math/audio/3d/network/...) and
  // a parallel "searchbox extras" registry (operator shortcuts like MAX/==)
  // that don't apply here.
  for (const type of Object.keys(LiteGraph.registered_node_types)) {
    if (!OUR_TYPES.includes(type)) LiteGraph.unregisterNodeType(type);
  }
  LiteGraph.searchbox_extras = {};

  const graph = new LGraph();
  graph.onConnectionChange = () => scheduleRun();
  graph.onNodeAdded = () => scheduleRun();
  graph.onNodeRemoved = () => scheduleRun();

  const canvas = new LGraphCanvas(canvasEl, graph);

  // Default pipeline: Source -> Cluster(folder) -> Render, with Source's
  // edges wired straight to Render (unfiltered).
  const source = LiteGraph.createNode('Graph Source');
  source.pos = [40, 220];
  graph.add(source);

  const cluster = LiteGraph.createNode('Cluster Nodes');
  cluster.pos = [320, 160];
  graph.add(cluster);

  const render = LiteGraph.createNode('Render Graph');
  render.pos = [600, 200];
  graph.add(render);

  source.connect(0, cluster, 0);
  source.connect(1, render, 1);
  cluster.connect(0, render, 0);
  cluster.connect(1, render, 2);

  graph.runStep(); // populate the initial render synchronously before returning

  return { graph, canvas, LiteGraph };
}
