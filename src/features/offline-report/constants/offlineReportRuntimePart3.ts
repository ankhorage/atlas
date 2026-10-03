/** Static browser-runtime fragment 3 of the self-contained Atlas offline viewer. */
export const OFFLINE_REPORT_RUNTIME_PART_3 = String.raw`      });
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
