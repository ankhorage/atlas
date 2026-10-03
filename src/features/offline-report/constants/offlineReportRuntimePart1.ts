/** Static browser-runtime fragment 1 of the self-contained Atlas offline viewer. */
export const OFFLINE_REPORT_RUNTIME_PART_1 = String.raw`
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
      }`;
