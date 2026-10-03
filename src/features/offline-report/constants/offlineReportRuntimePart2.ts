/** Static browser-runtime fragment 2 of the self-contained Atlas offline viewer. */
export const OFFLINE_REPORT_RUNTIME_PART_2 = String.raw`    }
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
        card.append(element("p", "", "+ " + String(evidence.message || "")));`;
