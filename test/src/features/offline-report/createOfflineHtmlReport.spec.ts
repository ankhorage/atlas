import { deserializeSourceGraph } from '@ankhorage/dependency-graph';
import { toCytoscapeElements } from '@ankhorage/graph-cytoscape';
import { describe, expect, it } from '@artiphishle/testosterone';
import { resolve } from 'node:path';

import { createAuditAsync } from '@/features/audit/composition/createAuditAsync';
import { createOfflineHtmlReport } from '@/features/offline-report/application/createOfflineHtmlReport';
import { OFFLINE_REPORT_RUNTIME } from '@/features/offline-report/constants/offlineReportRuntime';
import { OFFLINE_REPORT_STYLE } from '@/features/offline-report/constants/offlineReportStyle';
import { buildProjectTree } from '@/features/project-tree/application/use-cases/buildProjectTree';
import type { Audit } from '@/types/audit';

describe('[createOfflineHtmlReport]', () => {
  it('reconstructs captured viewer views through canonical presentation data', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));
    const payload = readEmbeddedPayload(createOfflineHtmlReport(audit));

    expect(payload.audit).toEqual(JSON.parse(JSON.stringify(audit)) as Audit);
    expect(payload.tree).toEqual(buildProjectTree(audit.files));
    expect(payload.graph).toEqual(
      toCytoscapeElements(audit.packageGraph, {
        nodeClasses: node => (node.data.isIntrinsic === true ? undefined : 'isVendor'),
      })
    );
    expect(payload.audit.meta).toEqual(audit.meta);
    expect(payload.audit.evaluation).toEqual(audit.evaluation);
    expect(deserializeSourceGraph(payload.audit.sourceGraph)).toEqual(
      deserializeSourceGraph(audit.sourceGraph)
    );
  });

  it('embeds every runtime resource and requires no network for file URL startup', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));
    const html = createOfflineHtmlReport(audit);
    const executableDocument = removeEmbeddedPayload(html);

    expect(html.includes('<style>\n' + OFFLINE_REPORT_STYLE + '\n</style>')).toBe(true);
    expect(html.includes('<script>\n' + OFFLINE_REPORT_RUNTIME + '\n</script>')).toBe(true);
    expect((html.match(/<style>/g) ?? []).length).toBe(1);
    expect((html.match(/<script(?:\s|>)/g) ?? []).length).toBe(2);
    expect(
      (html.match(/<script id="atlas-report-data" type="application\/json">/g) ?? []).length
    ).toBe(1);
    expect(executableDocument.includes('id="atlas-report-root"')).toBe(true);
    expect(executableDocument.includes('<base ')).toBe(false);
    expect(executableDocument.includes('type="module"')).toBe(false);
    expect(/<script[^>]+\bsrc=/i.test(executableDocument)).toBe(false);
    expect(/<link[^>]+\bhref=/i.test(executableDocument)).toBe(false);
    expect(/<(?:img|iframe|audio|video|source)[^>]+\bsrc=/i.test(executableDocument)).toBe(false);
    expect(/@import\b/i.test(executableDocument)).toBe(false);
    expect(/url\s*\(/i.test(readInlineStyle(html))).toBe(false);
    expect(/sourceMappingURL/i.test(executableDocument)).toBe(false);
    expect(/\bfetch\s*\(/.test(executableDocument)).toBe(false);
    expect(
      /XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts/.test(executableDocument)
    ).toBe(false);
    expect(executableDocument.includes("connect-src 'none'")).toBe(true);
  });

  it('preserves analyzer capabilities and semantic source evidence through export/import', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));
    const payload = readEmbeddedPayload(createOfflineHtmlReport(audit));
    const original = deserializeSourceGraph(audit.sourceGraph);
    const restored = deserializeSourceGraph(payload.audit.sourceGraph);

    expect(restored.capabilities).toEqual(original.capabilities);
    expect(restored.graph.nodes).toEqual(original.graph.nodes);
    expect(restored.graph.edges).toEqual(original.graph.edges);
    expect(restored.capabilities.some(report => report.available.length > 0)).toBe(true);
    expect(JSON.stringify(restored.graph.edges).includes('sourcePath')).toBe(true);
  });

  it('escapes project-controlled payload strings without changing their imported value', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));
    const projectName =
      '</script><script>globalThis.compromised=true</script>&<img src=x>\u2028\u2029';
    const html = createOfflineHtmlReport({
      ...audit,
      meta: { ...audit.meta, projectName },
    });
    const payload = readEmbeddedPayload(html);

    expect(html.includes(projectName)).toBe(false);
    expect(html.includes('</script><script>globalThis.compromised=true</script>')).toBe(false);
    expect(html.includes('<img src=x>')).toBe(false);
    expect(html.includes('\\u003c/script\\u003e')).toBe(true);
    expect(html.includes('\\u0026')).toBe(true);
    expect(payload.audit.meta.projectName).toBe(projectName);
  });

  it('is byte-deterministic for the same normalized captured Audit', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));

    expect(createOfflineHtmlReport(audit)).toBe(createOfflineHtmlReport(audit));
  });
});

/*** Read the single inline stylesheet so CSS resource assertions do not inspect browser JavaScript APIs. */
function readInlineStyle(html: string): string {
  const startMarker = '<style>\n';
  const endMarker = '\n</style>';
  const start = html.indexOf(startMarker);
  if (start < 0) throw new Error('Missing embedded Atlas report stylesheet.');
  const contentStart = start + startMarker.length;
  const end = html.indexOf(endMarker, contentStart);
  if (end < 0) throw new Error('Missing embedded Atlas report stylesheet terminator.');
  return html.slice(contentStart, end);
}

/*** Remove project-controlled JSON so resource assertions inspect executable report markup only. */
function removeEmbeddedPayload(html: string): string {
  const marker = '<script id="atlas-report-data" type="application/json">\n';
  const start = html.indexOf(marker);
  if (start < 0) throw new Error('Missing embedded Atlas report payload.');
  const end = html.indexOf('\n</script>', start + marker.length);
  if (end < 0) throw new Error('Missing embedded Atlas report payload terminator.');
  return html.slice(0, start) + html.slice(end + '\n</script>'.length);
}

/*** Read the serialized report payload exactly as the offline browser runtime does. */
function readEmbeddedPayload(html: string): OfflinePayload {
  const marker = '<script id="atlas-report-data" type="application/json">\n';
  const start = html.indexOf(marker);
  if (start < 0) throw new Error('Missing embedded Atlas report payload.');
  const payloadStart = start + marker.length;
  const end = html.indexOf('\n</script>', payloadStart);
  if (end < 0) throw new Error('Missing embedded Atlas report payload terminator.');
  return JSON.parse(html.slice(payloadStart, end)) as OfflinePayload;
}

interface OfflinePayload {
  readonly audit: Audit;
  readonly graph: ReturnType<typeof toCytoscapeElements>;
  readonly tree: ReturnType<typeof buildProjectTree>;
  readonly version: number;
}
