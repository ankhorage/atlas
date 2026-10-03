/** Static CSS embedded directly into every self-contained Atlas offline report. */
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
