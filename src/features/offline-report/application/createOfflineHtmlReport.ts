import { toCytoscapeElements } from '@ankhorage/graph-cytoscape';
import { isRecord } from '@ankhorage/utility/object';

import { OFFLINE_REPORT_RUNTIME } from '@/features/offline-report/constants/offlineReportRuntime';
import { OFFLINE_REPORT_STYLE } from '@/features/offline-report/constants/offlineReportStyle';
import { buildProjectTree } from '@/features/project-tree/application/use-cases/buildProjectTree';
import type { Audit } from '@/types/audit';

/***
 * Build one deterministic, self-contained HTML document from an already captured canonical Audit.
 * Project-controlled data is encoded as JSON and escapes every HTML/script delimiter before
 * insertion. The browser runtime renders payload strings only through DOM text nodes.
 */
export function createOfflineHtmlReport(audit: Audit): string {
  const payload = {
    audit,
    graph: toCytoscapeElements(audit.packageGraph, {
      nodeClasses: node => (node.data.isIntrinsic === true ? undefined : 'isVendor'),
    }),
    tree: buildProjectTree(audit.files),
    version: 1,
  };
  const json = JSON.stringify(sortSerializableValue(payload));
  if (json === undefined) throw new Error('Unable to serialize Atlas offline report payload.');
  const serializedPayload = json
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'\">",
    '<meta name="generator" content="Ankhorage Atlas">',
    '<title>Atlas Offline Report</title>',
    '<style>',
    OFFLINE_REPORT_STYLE,
    '</style>',
    '</head>',
    '<body>',
    '<div id="atlas-report-root" aria-live="polite"></div>',
    '<script id="atlas-report-data" type="application/json">',
    serializedPayload,
    '</script>',
    '<script>',
    OFFLINE_REPORT_RUNTIME,
    '</script>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}


/*** Recursively sort JSON object keys while preserving array order and scalar values. */
function sortSerializableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortSerializableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortSerializableValue(entry)])
  );
}
