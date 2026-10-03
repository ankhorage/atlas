/**
 * Static browser presentation for a self-contained Atlas report.
 *
 * Project-controlled values never flow into this source. The runtime reads the escaped JSON payload
 * and renders all text through DOM text nodes/textContent so source strings cannot become markup.
 */
export const OFFLINE_REPORT_STYLE = String.raw`
:root {
  color-scheme: light dark;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --bg: #f6f7f9;
  --panel: #ffffff;
  --panel-2: #f0f2f5;
  --text: #17191c;
  --muted: #626a73;
  --border: #d8dde3;
  --accent: #2563eb;
  --accent-soft: #dbeafe;
  --danger: #b42318;
  --danger-soft: #fee4e2;
  --success: #087443;
  --shadow: 0 12px 32px rgba(16, 24, 40, 0.08);
}
:root[data-theme="dark"] {
  --bg: #111315;
  --panel: #171a1e;
  --panel-2: #20242a;
  --text: #f3f4f6;
  --muted: #a5adb8;
  --border: #343a43;
  --accent: #60a5fa;
  --accent-soft: #172554;
  --danger: #f97066;
  --danger-soft: #4a1d1d;
  --success: #47cd89;
  --shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
}
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body { background: var(--bg); color: var(--text); overflow: hidden; }
button, input { font: inherit; }
button { color: inherit; }
#atlas-report-root { height: 100%; min-height: 0; }
.atlas-shell { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.atlas-header {
  align-items: center;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  display: flex;
  gap: 12px;
  min-height: 52px;
  padding: 8px 12px;
}
.atlas-title { font-size: 14px; font-weight: 700; white-space: nowrap; }
.atlas-breadcrumbs {
  align-items: center;
  display: flex;
  flex: 1;
  gap: 4px;
  min-width: 0;
  overflow: auto;
}
.atlas-breadcrumbs button {
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  padding: 6px 8px;
  white-space: nowrap;
}
.atlas-breadcrumbs button:hover { background: var(--panel-2); }
.atlas-breadcrumb-separator { color: var(--muted); }
.atlas-header-actions { align-items: center; display: flex; gap: 8px; }
.atlas-button {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 7px;
  cursor: pointer;
  padding: 7px 10px;
}
.atlas-button:hover { background: var(--panel-2); }
.atlas-button[aria-pressed="true"] {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}
.atlas-main { display: flex; flex: 1; min-height: 0; min-width: 0; }
.atlas-sidebar {
  background: var(--panel);
  border-right: 1px solid var(--border);
  display: flex;
  flex: 0 0 320px;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
.atlas-tabs { border-bottom: 1px solid var(--border); display: flex; gap: 2px; padding: 6px; }
.atlas-tab {
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  flex: 1;
  padding: 8px 6px;
}
.atlas-tab[aria-selected="true"] {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 700;
}
.atlas-sidebar-content { flex: 1; min-height: 0; overflow: auto; padding: 8px; }
.atlas-panel-heading { font-size: 12px; font-weight: 800; letter-spacing: .04em; margin: 8px 4px; text-transform: uppercase; }
.atlas-muted { color: var(--muted); }
.atlas-tree { font-size: 13px; }
.atlas-tree details { margin-left: 12px; }
.atlas-tree > details { margin-left: 0; }
.atlas-tree summary { cursor: pointer; list-style-position: outside; padding: 2px 0; }
.atlas-tree-row {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 5px;
  cursor: pointer;
  display: flex;
  gap: 6px;
  max-width: 100%;
  padding: 4px 6px;
  text-align: left;
}
.atlas-tree-row:hover { background: var(--panel-2); }
.atlas-tree-row.is-selected { background: var(--accent-soft); color: var(--accent); }
.atlas-tree-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.atlas-content { display: flex; flex: 1; min-height: 0; min-width: 0; position: relative; }
.atlas-graph-wrap { display: flex; flex: 1; flex-direction: column; min-height: 0; min-width: 0; padding: 12px; }
.atlas-graph-toolbar { align-items: center; display: flex; gap: 8px; padding-bottom: 8px; }
.atlas-graph-meta { color: var(--muted); flex: 1; font-size: 12px; }
.atlas-graph-frame {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}
.atlas-graph-frame svg { display: block; height: 100%; width: 100%; }
.atlas-edge { stroke: var(--border); stroke-linecap: round; }
.atlas-edge.is-cycle { stroke: var(--danger); }
.atlas-node rect {
  fill: var(--panel-2);
  stroke: var(--border);
  stroke-width: 1.5;
}
.atlas-node text {
  fill: var(--text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  pointer-events: none;
}
.atlas-node { cursor: pointer; }
.atlas-node:hover rect { stroke: var(--accent); stroke-width: 2; }
.atlas-node.is-selected rect { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 2.5; }
.atlas-node.is-cycle rect { fill: var(--danger-soft); stroke: var(--danger); stroke-width: 2.5; }
.atlas-node.is-vendor rect { stroke-dasharray: 4 3; }
.atlas-card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow);
  margin: 6px 0;
  padding: 10px;
}
.atlas-card-title { font-size: 13px; font-weight: 800; margin-bottom: 5px; }
.atlas-card p { font-size: 12px; margin: 5px 0; }
.atlas-card code, .atlas-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  overflow-wrap: anywhere;
}
.atlas-finding { border-left: 3px solid var(--danger); }
.atlas-success { color: var(--success); }
.atlas-inspector {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow);
  max-height: calc(100% - 32px);
  overflow: auto;
  padding: 14px;
  position: absolute;
  right: 16px;
  top: 16px;
  width: min(440px, calc(100% - 32px));
  z-index: 10;
}
.atlas-inspector-head { align-items: center; display: flex; gap: 8px; }
.atlas-inspector-head strong { flex: 1; }
.atlas-evidence { border-top: 1px solid var(--border); margin-top: 8px; padding-top: 8px; }
.atlas-evidence details { margin: 4px 0; }
.atlas-evidence summary { cursor: pointer; font-size: 12px; font-weight: 700; }
.atlas-evidence pre, .atlas-source-graph {
  background: var(--panel-2);
  border-radius: 6px;
  font-size: 11px;
  max-height: 260px;
  overflow: auto;
  padding: 8px;
  white-space: pre-wrap;
  word-break: break-word;
}
.atlas-empty {
  align-items: center;
  color: var(--muted);
  display: flex;
  font-size: 13px;
  justify-content: center;
  min-height: 120px;
  text-align: center;
}
.atlas-badge {
  background: var(--danger-soft);
  border-radius: 999px;
  color: var(--danger);
  display: inline-block;
  font-size: 10px;
  font-weight: 800;
  margin-left: 4px;
  padding: 2px 6px;
}
.atlas-kv { display: grid; font-size: 12px; gap: 4px 8px; grid-template-columns: max-content 1fr; }
.atlas-kv dt { color: var(--muted); }
.atlas-kv dd { margin: 0; overflow-wrap: anywhere; }
@media (max-width: 820px) {
  .atlas-sidebar { flex-basis: 260px; }
  .atlas-title { display: none; }
}
@media (max-width: 640px) {
  body { overflow: auto; }
  .atlas-shell { height: auto; min-height: 100%; }
  .atlas-main { flex-direction: column; }
  .atlas-sidebar { border-bottom: 1px solid var(--border); border-right: 0; flex-basis: auto; max-height: 45vh; }
  .atlas-content { min-height: 60vh; }
  .atlas-header { flex-wrap: wrap; }
}
`;

/**
 * The runtime intentionally uses only browser built-ins. It never fetches source data or assets.
 * Graph elements, project tree, audit evidence, and metadata are already embedded in the payload.
 */
export const OFFLINE_REPORT_RUNTIME = String.raw`
(function () {
  "use strict";

  var payloadNode = document.getElementById("atlas-report-data");
  var root = document.getElementById("atlas-report-root");
  if (!payloadNode || !root) return;

  var payload;
  try {
    payload = JSON.parse(payloadNode.textContent || "{}");
  } catch (error) {
    root.textContent = "Unable to read the embedded Atlas report: " + String(error);
    return;
  }

  var audit = payload.audit || {};
  var graph = payload.graph || { nodes: [], edges: [] };
  var tree = payload.tree || [];
  var evaluation = audit.evaluation || {};
  var state = {
    activeTab: "tree",
    currentPackage: "",
    selectedGraphIds: new Set(),
    selectedTreeIds: new Set(),
    inspectedCycle: null,
    cyclePackages: new Set(),
    zoom: 1
  };

  var shell = element("div", "atlas-shell");
  var header = element("header", "atlas-header");
  var title = element("div", "atlas-title", "Atlas · " + readProjectName());
  var breadcrumbs = element("nav", "atlas-breadcrumbs");
  var headerActions = element("div", "atlas-header-actions");
  var themeButton = actionButton("Theme", toggleTheme);
  var downloadButton = actionButton("Audit JSON", downloadAudit);
  var main = element("div", "atlas-main");
  var sidebar = element("aside", "atlas-sidebar");
  var tabs = element("div", "atlas-tabs");
  var sidebarContent = element("div", "atlas-sidebar-content");
  var content = element("section", "atlas-content");
  var graphWrap = element("div", "atlas-graph-wrap");
  var graphToolbar = element("div", "atlas-graph-toolbar");
  var graphMeta = element("div", "atlas-graph-meta");
  var zoomOut = actionButton("−", function () { setZoom(state.zoom / 1.2); });
  var zoomIn = actionButton("+", function () { setZoom(state.zoom * 1.2); });
  var fit = actionButton("Fit", function () { setZoom(1); });
  var graphFrame = element("div", "atlas-graph-frame");
  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  var inspector = element("aside", "atlas-inspector");
  inspector.hidden = true;

  root.replaceChildren(shell);
  shell.append(header, main);
  header.append(title, breadcrumbs, headerActions);
  headerActions.append(downloadButton, themeButton);
  main.append(sidebar, content);
  sidebar.append(tabs, sidebarContent);
  content.append(graphWrap, inspector);
  graphWrap.append(graphToolbar, graphFrame);
  graphToolbar.append(graphMeta, zoomOut, fit, zoomIn);
  graphFrame.append(svg);

  ["tree", "rules", "architecture", "audit"].forEach(function (tab) {
    var label = tab.charAt(0).toUpperCase() + tab.slice(1);
    if (tab === "rules") {
      var count = findingCount();
      if (count > 0) label += " (" + count + ")";
    }
    var button = element("button", "atlas-tab", label);
    button.type = "button";
    button.dataset.tab = tab;
    button.addEventListener("click", function () {
      state.activeTab = tab;
      renderSidebar();
    });
    tabs.append(button);
  });

  applyInitialTheme();
  renderAll();

  function renderAll() {
    renderBreadcrumbs();
    renderSidebar();
    renderGraph();
    renderInspector();
  }

  function renderBreadcrumbs() {
    breadcrumbs.replaceChildren();
    var projectButton = element("button", "", readProjectName());
    projectButton.type = "button";
    projectButton.disabled = true;
    breadcrumbs.append(projectButton);
    appendBreadcrumb("", "Packages");
    var segments = normalizePackage(state.currentPackage).split(".").filter(Boolean);
    segments.forEach(function (segment, index) {
      appendBreadcrumb(segments.slice(0, index + 1).join("."), segment);
    });
  }

  function appendBreadcrumb(id, label) {
    breadcrumbs.append(element("span", "atlas-breadcrumb-separator", "›"));
    var button = element("button", "", label);
    button.type = "button";
    button.addEventListener("click", function () {
      state.currentPackage = id;
      renderBreadcrumbs();
      renderGraph();
    });
    breadcrumbs.append(button);
  }

  function renderSidebar() {
    Array.from(tabs.querySelectorAll(".atlas-tab")).forEach(function (button) {
      button.setAttribute("aria-selected", button.dataset.tab === state.activeTab ? "true" : "false");
    });
    sidebarContent.replaceChildren();
    if (state.activeTab === "tree") renderTree();
    if (state.activeTab === "rules") renderRules();
    if (state.activeTab === "architecture") renderArchitecture();
    if (state.activeTab === "audit") renderAuditData();
  }

  function renderTree() {
    sidebarContent.append(element("div", "atlas-panel-heading", "Project tree"));
    if (!tree.length) {
      sidebarContent.append(empty("No project tree was captured."));
      return;
    }
    var host = element("div", "atlas-tree");
    tree.forEach(function (node) { host.append(renderTreeNode(node, 0)); });
    sidebarContent.append(host);
  }

  function renderTreeNode(node, depth) {
    var hasChildren = Array.isArray(node.children) && node.children.length > 0;
    var container = hasChildren ? document.createElement("details") : element("div", "");
    if (hasChildren && depth < 1) container.open = true;
    var row = treeRow(node);
    if (hasChildren) {
      var summary = document.createElement("summary");
      summary.append(row);
      container.append(summary);
      node.children.forEach(function (child) { container.append(renderTreeNode(child, depth + 1)); });
    } else {
      container.append(row);
    }
    return container;
  }

  function treeRow(node) {
    var icon = node.kind === "directory" ? "▣" : "·";
    var row = element("button", "atlas-tree-row");
    row.type = "button";
    row.dataset.treeId = node.id || "";
    row.title = node.graphPackage || node.label || "";
    row.append(element("span", "", icon), element("span", "atlas-tree-label", node.label || node.id || ""));
    if (state.selectedTreeIds.has(node.id)) row.classList.add("is-selected");
    row.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      selectTreeNode(node, event.metaKey || event.ctrlKey);
    });
    row.addEventListener("dblclick", function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (node.graphPackage) {
        state.currentPackage = normalizePackage(node.graphPackage);
        renderBreadcrumbs();
        renderGraph();
      }
    });
    return row;
  }

  function selectTreeNode(node, toggle) {
    var graphId = graphNodeExists(node.graphPackage) ? normalizePackage(node.graphPackage) : "";
    applySelection(graphId, node.id || "", toggle);
  }

  function selectGraphNode(id, toggle) {
    var treeId = findTreeIdForPackage(tree, id);
    applySelection(id, treeId, toggle);
  }

  function applySelection(graphId, treeId, toggle) {
    var alreadyOnly = graphId && state.selectedGraphIds.size === 1 && state.selectedGraphIds.has(graphId);
    if (toggle) {
      toggleSet(state.selectedGraphIds, graphId);
      toggleSet(state.selectedTreeIds, treeId);
    } else if (alreadyOnly) {
      state.selectedGraphIds.clear();
      state.selectedTreeIds.clear();
    } else {
      state.selectedGraphIds.clear();
      state.selectedTreeIds.clear();
      if (graphId) state.selectedGraphIds.add(graphId);
      if (treeId) state.selectedTreeIds.add(treeId);
    }
    renderSidebar();
    renderGraph();
  }

  function toggleSet(set, value) {
    if (!value) return;
    if (set.has(value)) set.delete(value);
    else set.add(value);
  }

  function findTreeIdForPackage(nodes, packageId) {
    for (var index = 0; index < nodes.length; index += 1) {
      var node = nodes[index];
      if (normalizePackage(node.graphPackage) === packageId) return node.id || "";
      if (Array.isArray(node.children)) {
        var child = findTreeIdForPackage(node.children, packageId);
        if (child) return child;
      }
    }
    return "";
  }

  function renderGraph() {
    svg.replaceChildren();
    var nodes = visibleNodes();
    var nodeIds = new Set(nodes.map(function (node) { return node.data.id; }));
    var edges = (graph.edges || []).filter(function (edge) {
      return nodeIds.has(edge.data.source) && nodeIds.has(edge.data.target);
    });
    var layout = gridLayout(nodes);
    var positions = layout.positions;
    var edgeLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    var nodeLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svg.append(edgeLayer, nodeLayer);
    edges.forEach(function (edge) {
      var source = positions[edge.data.source];
      var target = positions[edge.data.target];
      if (!source || !target) return;
      var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(source.x + 78));
      line.setAttribute("y1", String(source.y + 20));
      line.setAttribute("x2", String(target.x + 78));
      line.setAttribute("y2", String(target.y + 20));
      line.setAttribute("class", "atlas-edge" + (isCycleEdge(edge) ? " is-cycle" : ""));
      line.setAttribute("stroke-width", String(Math.min(6, 1 + Math.log2(Number(edge.data.weight || 1) + 1))));
      var edgeTitle = document.createElementNS("http://www.w3.org/2000/svg", "title");
      edgeTitle.textContent = edge.data.source + " → " + edge.data.target + " · weight " + String(edge.data.weight || 1);
      line.append(edgeTitle);
      edgeLayer.append(line);
    });
    nodes.forEach(function (node) {
      nodeLayer.append(renderGraphNode(node, positions[node.data.id]));
    });
    svg.dataset.width = String(layout.width);
    svg.dataset.height = String(layout.height);
    applyZoom();
    graphMeta.textContent = nodes.length + " nodes · " + edges.length + " edges" + (state.currentPackage ? " · scope " + state.currentPackage : "");
  }

  function visibleNodes() {
    var nodes = graph.nodes || [];
    if (!state.currentPackage) return nodes;
    var prefix = state.currentPackage + ".";
    return nodes.filter(function (node) {
      var id = normalizePackage(node.data.id);
      return id === state.currentPackage || id.indexOf(prefix) === 0;
    });
  }

  function gridLayout(nodes) {
    var columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length * 1.6)));
    var cellWidth = 190;
    var cellHeight = 72;
    var positions = {};
    nodes.forEach(function (node, index) {
      positions[node.data.id] = {
        x: 24 + (index % columns) * cellWidth,
        y: 24 + Math.floor(index / columns) * cellHeight
      };
    });
    return {
      positions: positions,
      width: Math.max(420, 48 + columns * cellWidth),
      height: Math.max(280, 48 + Math.ceil(nodes.length / columns) * cellHeight)
    };
  }

  function renderGraphNode(node, position) {
    var group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    var classes = ["atlas-node"];
    if (state.selectedGraphIds.has(node.data.id)) classes.push("is-selected");
    if (state.cyclePackages.has(node.data.id)) classes.push("is-cycle");
    if (String(node.classes || "").indexOf("isVendor") >= 0) classes.push("is-vendor");
    group.setAttribute("class", classes.join(" "));
    group.setAttribute("transform", "translate(" + position.x + " " + position.y + ")");
    var rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("width", "156");
    rect.setAttribute("height", "40");
    rect.setAttribute("rx", "8");
    var text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", "8");
    text.setAttribute("y", "24");
    text.textContent = truncate(String(node.data.label || node.data.id || ""), 22);
    var nodeTitle = document.createElementNS("http://www.w3.org/2000/svg", "title");
    nodeTitle.textContent = String(node.data.id || "");
    group.append(rect, text, nodeTitle);
    group.addEventListener("click", function (event) {
      selectGraphNode(node.data.id, event.metaKey || event.ctrlKey);
    });
    group.addEventListener("dblclick", function (event) {
      event.preventDefault();
      if (hasDescendants(node.data.id)) {
        state.currentPackage = normalizePackage(node.data.id);
        renderBreadcrumbs();
        renderGraph();
      }
    });
    return group;
  }

  function hasDescendants(id) {
    var prefix = normalizePackage(id) + ".";
    return (graph.nodes || []).some(function (node) {
      return normalizePackage(node.data.id).indexOf(prefix) === 0;
    });
  }

  function graphNodeExists(id) {
    var normalized = normalizePackage(id);
    if (!normalized) return false;
    return (graph.nodes || []).some(function (node) { return node.data.id === normalized; });
  }

  function setZoom(value) {
    state.zoom = Math.max(0.35, Math.min(3, value));
    applyZoom();
  }

  function applyZoom() {
    var width = Number(svg.dataset.width || 800);
    var height = Number(svg.dataset.height || 600);
    svg.setAttribute("viewBox", "0 0 " + String(width / state.zoom) + " " + String(height / state.zoom));
  }

  function renderRules() {
    sidebarContent.append(element("div", "atlas-panel-heading", "Rule findings"));
    var hasAny = false;
    var rules = evaluation.rules || [];
    rules.filter(function (rule) { return rule.status === "failed"; }).forEach(function (rule) {
      hasAny = true;
      if (rule.id === "cyclic-dependencies") renderCycles();
      else renderSpecializedRule(rule);
    });
    var generic = ((evaluation.genericRules || {}).findings || []).filter(function (finding) {
      return finding.ruleId !== "cyclic-dependencies";
    });
    generic.forEach(function (finding) {
      hasAny = true;
      var card = element("div", "atlas-card atlas-finding");
      card.append(
        element("div", "atlas-card-title", finding.ruleId + " · " + String(finding.severity || "")),
        element("p", "", finding.message || "")
      );
      (finding.subjects || []).forEach(function (subject) {
        card.append(element("div", "atlas-code", subject.path || subject.id || ""));
      });
      if (finding.evidence !== undefined) {
        var details = document.createElement("details");
        var summary = document.createElement("summary");
        summary.textContent = "Evidence";
        var pre = document.createElement("pre");
        pre.textContent = stringify(finding.evidence);
        details.append(summary, pre);
        card.append(details);
      }
      sidebarContent.append(card);
    });
    if (!hasAny) sidebarContent.append(empty("No rule findings were captured."));
  }

  function renderSpecializedRule(rule) {
    var card = element("div", "atlas-card atlas-finding");
    card.append(element("div", "atlas-card-title", rule.id || "Rule"));
    (rule.details || []).forEach(function (detail) {
      card.append(element("div", "atlas-code", detail));
    });
    sidebarContent.append(card);
  }

  function renderCycles() {
    var cycles = evaluation.cyclicPackages || [];
    if (!cycles.length) return;
    cycles.forEach(function (cycle, index) {
      var card = element("div", "atlas-card atlas-finding");
      var button = element("button", "atlas-button", "Inspect cycle " + String(index + 1));
      button.type = "button";
      button.addEventListener("click", function () {
        state.inspectedCycle = cycle;
        state.cyclePackages = new Set(cycle.packages || []);
        renderGraph();
        renderInspector();
      });
      card.append(
        element("div", "atlas-card-title", "cyclic-dependencies"),
        element("p", "atlas-code", (cycle.packages || []).join(" → ")),
        button
      );
      sidebarContent.append(card);
    });
  }

  function renderArchitecture() {
    sidebarContent.append(element("div", "atlas-panel-heading", "Architecture analysis"));
    var architecture = evaluation.architecture || {};
    var target = evaluation.architectureEvaluation;
    if (target && target.target) {
      var targetCard = element("div", "atlas-card");
      targetCard.append(
        element("div", "atlas-card-title", "Enforcement target"),
        element("p", "atlas-code", String(target.target.kind || "") + ": " + String(target.target.id || ""))
      );
      sidebarContent.append(targetCard);
    } else {
      sidebarContent.append(element("p", "atlas-muted", "Detection only · no enforcement target selected."));
    }
    var candidates = architecture.candidates || [];
    if (!candidates.length) {
      sidebarContent.append(empty("No architecture candidates were detected."));
      return;
    }
    candidates.forEach(function (candidate) {
      var card = element("div", "atlas-card");
      var confidence = Math.round(Number(candidate.confidence || 0) * 100);
      card.append(
        element("div", "atlas-card-title", candidate.modelId + " · confidence " + confidence + "% · score " + Number(candidate.score || 0).toFixed(2))
      );
      (candidate.supportingEvidence || []).forEach(function (evidence) {
        card.append(element("p", "", "+ " + String(evidence.message || "")));
      });
      (candidate.contradictions || []).forEach(function (evidence) {
        card.append(element("p", "", "! " + String(evidence.message || "")));
      });
      if ((candidate.unavailableCapabilities || []).length) {
        card.append(element("p", "atlas-muted", "Missing capabilities: " + candidate.unavailableCapabilities.join(", ")));
      }
      sidebarContent.append(card);
    });
  }

  function renderAuditData() {
    sidebarContent.append(element("div", "atlas-panel-heading", "Captured audit"));
    var meta = audit.meta || {};
    var list = document.createElement("dl");
    list.className = "atlas-kv";
    appendKeyValue(list, "Project", meta.projectName || "");
    appendKeyValue(list, "Language", ((meta.language || {}).language) || "");
    appendKeyValue(list, "Started", String(meta.timeStart || ""));
    appendKeyValue(list, "Ended", String(meta.timeEnd || ""));
    if (meta.source) {
      appendKeyValue(list, "Source", meta.source.url || "");
      appendKeyValue(list, "Revision", meta.source.revision || "");
    }
    sidebarContent.append(list);
    var graphDetails = document.createElement("details");
    var graphSummary = document.createElement("summary");
    graphSummary.textContent = "Serialized SourceGraph";
    var sourceGraph = document.createElement("pre");
    sourceGraph.className = "atlas-source-graph";
    sourceGraph.textContent = String(audit.sourceGraph || "");
    graphDetails.append(graphSummary, sourceGraph);
    sidebarContent.append(graphDetails);
  }

  function appendKeyValue(list, key, value) {
    list.append(element("dt", "", key), element("dd", "", String(value)));
  }

  function renderInspector() {
    inspector.replaceChildren();
    var cycle = state.inspectedCycle;
    if (!cycle) {
      inspector.hidden = true;
      return;
    }
    inspector.hidden = false;
    var head = element("div", "atlas-inspector-head");
    var close = actionButton("Close", function () {
      state.inspectedCycle = null;
      state.cyclePackages = new Set();
      renderGraph();
      renderInspector();
    });
    head.append(element("strong", "", "Cycle evidence"), close);
    inspector.append(
      head,
      element("p", "atlas-code", (cycle.packages || []).join(" → ")),
      element("p", "atlas-muted", String(new Set(cycle.packages || []).size) + " packages · " + String((cycle.edges || []).length) + " dependency edges")
    );
    var evidenceHost = element("div", "atlas-evidence");
    (cycle.edges || []).forEach(function (edge, index) {
      var details = document.createElement("details");
      var summary = document.createElement("summary");
      summary.textContent = String(index + 1) + ". " + edge.from + " → " + edge.to;
      details.append(summary);
      if (!(edge.via || []).length) {
        details.append(element("p", "atlas-muted", "No import evidence captured."));
      } else {
        (edge.via || []).forEach(function (evidence) {
          details.append(element("pre", "", evidence.filePath + " imports " + evidence.importName + "\nclass: " + evidence.fileClass));
        });
      }
      evidenceHost.append(details);
    });
    inspector.append(evidenceHost);
  }

  function isCycleEdge(edge) {
    if (!state.inspectedCycle) return false;
    return (state.inspectedCycle.edges || []).some(function (candidate) {
      return candidate.from === edge.data.source && candidate.to === edge.data.target;
    });
  }

  function findingCount() {
    var specialized = (evaluation.rules || [])
      .filter(function (rule) { return rule.status === "failed"; })
      .reduce(function (count, rule) {
        if (rule.id === "cyclic-dependencies") return count + (evaluation.cyclicPackages || []).length;
        return count + (rule.details || []).length;
      }, 0);
    var generic = (((evaluation.genericRules || {}).findings) || [])
      .filter(function (finding) { return finding.ruleId !== "cyclic-dependencies"; }).length;
    return specialized + generic;
  }

  function downloadAudit() {
    var blob = new Blob([JSON.stringify(audit, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "audit.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function toggleTheme() {
    var rootNode = document.documentElement;
    rootNode.dataset.theme = rootNode.dataset.theme === "dark" ? "light" : "dark";
  }

  function applyInitialTheme() {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.dataset.theme = "dark";
    }
  }

  function readProjectName() {
    return String(((audit.meta || {}).projectName) || "Project");
  }

  function normalizePackage(value) {
    return String(value || "").replaceAll("/", ".").replace(/^\.+|\.+$/g, "");
  }

  function truncate(value, max) {
    return value.length <= max ? value : value.slice(0, Math.max(1, max - 1)) + "…";
  }

  function stringify(value) {
    try {
      return JSON.stringify(value, null, 2);
    } catch (_error) {
      return String(value);
    }
  }

  function empty(message) {
    return element("div", "atlas-empty", message);
  }

  function actionButton(label, handler) {
    var button = element("button", "atlas-button", label);
    button.type = "button";
    button.addEventListener("click", handler);
    return button;
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }
})();
`;
