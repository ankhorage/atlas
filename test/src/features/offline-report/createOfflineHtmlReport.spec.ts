import { deserializeSourceGraph } from '@ankhorage/dependency-graph';
import { toCytoscapeElements } from '@ankhorage/graph-cytoscape';
import { describe, expect, it } from '@artiphishle/testosterone';
import { resolve } from 'node:path';

import { createAuditAsync } from '@/features/audit/composition/createAuditAsync';
import { createOfflineHtmlReport } from '@/features/offline-report/application/createOfflineHtmlReport';
import { buildProjectTree } from '@/features/project-tree/application/use-cases/buildProjectTree';
import { buildProjectTree } from '@/features/project-tree/application/use-cases/buildProjectTree';
import {
  OFFLINE_REPORT_RUNTIME,
  OFFLINE_REPORT_STYLE,
} from '@/features/offline-report/constants/offlineReportTemplate';

describe('[createOfflineHtmlReport]', () => {
  it('reconstructs the captured viewer views and evidence from the serialized payload', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));
    const payload = readEmbeddedPayload(createOfflineHtmlReport(audit));

    expect(payload.audit).toEqual(audit);
    expect(payload.tree).toEqual(buildProjectTree(audit.files));
    expect(payload.graph).toEqual(
      toCytoscapeElements(audit.packageGraph, {
        nodeClasses: node => (node.data.isIntrinsic === true ? undefined : 'isVendor'),
      })
    );
    expect(deserializeSourceGraph(payload.audit.sourceGraph)).toEqual(
      deserializeSourceGraph(audit.sourceGraph)
    );
  });

  it('embeds every runtime resource directly into the single HTML document', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));
    const html = createOfflineHtmlReport(audit);

    expect(html.includes('<style>\\n' + OFFLINE_REPORT_STYLE + '\\n</style>')).toBe(true);
    expect(html.includes('<script>\\n' + OFFLINE_REPORT_RUNTIME + '\\n</script>')).toBe(true);
    expect((html.match(/<style>/g) ?? []).length).toBe(1);
    expect((html.match(/<script(?:\\s|>)/g) ?? []).length).toBe(2);
    expect((html.match(/<script id="atlas-report-data" type="application\\/json">/g) ?? []).length).toBe(
      1
    );
  });

  it('requires no external runtime resources or browser network APIs', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));
    const html = createOfflineHtmlReport(audit);
    const executableDocument = removeEmbeddedPayload(html);

    expect(/<script[^>]+\\bsrc=/i.test(executableDocument)).toBe(false);
    expect(/<link[^>]+\\bhref=/i.test(executableDocument)).toBe(false);
    expect(/<(?:img|iframe|audio|video|source)[^>]+\\bsrc=/i.test(executableDocument)).toBe(false);
    expect(/@import\\b/i.test(executableDocument)).toBe(false);
    expect(/url\\s*\\(/i.test(executableDocument)).toBe(false);
    expect(/sourceMappingURL/i.test(executableDocument)).toBe(false);
    expect(/\\bfetch\\s*\\(/.test(executableDocument)).toBe(false);
    expect(/XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts/.test(executableDocument)).toBe(
      false
    );
  });

  it('is byte-deterministic for the same normalized captured Audit', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));

    expect(createOfflineHtmlReport(audit)).toBe(createOfflineHtmlReport(audit));
  });

  it('preserves analyzer capability reports and semantic source evidence through export/import', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));
    const payload = readEmbeddedPayload(createOfflineHtmlReport(audit));
    const sourceGraph = deserializeSourceGraph(payload.audit.sourceGraph);
    const original = deserializeSourceGraph(audit.sourceGraph);

    expect(sourceGraph).toEqual(original);
    expect(sourceGraph.capabilities.some(report => report.available.length > 0)).toBe(true);
    expect(JSON.stringify(sourceGraph.graph.edges).includes('sourcePath')).toBe(true);
  });

  it('escapes project-controlled payload strings without changing their imported value', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));
    const projectName = '</script><script>globalThis.compromised=true</script>&<img src=x>\u2028\u2029';
    const html = createOfflineHtmlReport({
      ...audit,
      meta: { ...audit.meta, projectName },
    });
    const payload = readEmbeddedPayload(html);

    expect(html.includes(projectName)).toBe(false);
    expect(html.includes('</script><script>globalThis.compromised=true</script>')).toBe(false);
    expect(html.includes('<img src=x>')).toBe(false);
    expect(payload.audit.meta.projectName).toBe(projectName);
  });

  it('embeds the captured viewer data without rebuilding analysis in the browser', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));
    const html = createOfflineHtmlReport(audit);
    const payload = readEmbeddedPayload(html);

    expect(payload.audit.packageGraph).toEqual(audit.packageGraph);
    expect(payload.audit.meta).toEqual(audit.meta);
    expect(payload.tree.length > 0).toBe(true);
    expect(payload.graph).toEqual(
      toCytoscapeElements(audit.packageGraph, {
        nodeClasses: node => (node.data.isIntrinsic === true ? undefined : 'isVendor'),
      })
    );
    expect(payload.audit.evaluation.architecture).toEqual(audit.evaluation.architecture);
    expect(payload.audit.evaluation.genericRules).toEqual(audit.evaluation.genericRules);
    expect(payload.audit.evaluation.rules).toEqual(audit.evaluation.rules);
    expect(payload.audit.evaluation.cyclicPackages).toEqual(audit.evaluation.cyclicPackages);
  });

  it('uses the canonical Graph to Cytoscape presentation conversion', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));
    const payload = readEmbeddedPayload(createOfflineHtmlReport(audit));

    expect(payload.graph).toEqual(
      toCytoscapeElements(audit.packageGraph, {
        nodeClasses: node => (node.data.isIntrinsic === true ? undefined : 'isVendor'),
      })
    );
  });

  it('retains every derived view required by the offline workspace', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));
    const payload = readEmbeddedPayload(createOfflineHtmlReport(audit));

    expect(payload.audit.packageGraph).toEqual(audit.packageGraph);
    expect(payload.tree).toEqual(buildProjectTree(audit.files));
    expect(payload.audit.meta).toEqual(audit.meta);
    expect(payload.audit.evaluation.architecture).toEqual(audit.evaluation.architecture);
    expect(payload.audit.evaluation.genericRules).toEqual(audit.evaluation.genericRules);
    expect(payload.audit.evaluation.rules).toEqual(audit.evaluation.rules);
    expect(payload.audit.evaluation.cyclicPackages).toEqual(audit.evaluation.cyclicPackages);
  });

  it('round-trips analyzer capabilities and semantic SourceGraph evidence', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));
    const payload = readEmbeddedPayload(createOfflineHtmlReport(audit));
    const original = deserializeSourceGraph(audit.sourceGraph);
    const restored = deserializeSourceGraph(payload.audit.sourceGraph);

    expect(restored.capabilities).toEqual(original.capabilities);
    expect(restored.graph.nodes).toEqual(original.graph.nodes);
    expect(restored.graph.edges).toEqual(original.graph.edges);
  });

  it('uses only inline startup resources so direct file URLs need no server', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));
    const html = createOfflineHtmlReport(audit);

    expect(html.includes('<script src=')).toBe(false);
    expect(html.includes('<link rel="stylesheet"')).toBe(false);
    expect(html.includes('<base ')).toBe(false);
    expect(html.includes('type="module"')).toBe(false);
    expect(html.includes('id="atlas-report-root"')).toBe(true);
  });

  it('escapes project-controlled data without changing the reconstructed Audit', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));
    const dangerous = '</script><script>globalThis.atlasInjected=true</script>&';
    const poisonedAudit = {
      ...audit,
      meta: { ...audit.meta, projectName: dangerous },
    };
    const html = createOfflineHtmlReport(poisonedAudit);
    const payload = readEmbeddedPayload(html);

    expect(html.includes(dangerous)).toBe(false);
    expect(html.includes('\\u003c/script\\u003e')).toBe(true);
    expect(html.includes('\\u0026')).toBe(true);
    expect(payload.audit.meta).toEqual(poisonedAudit.meta);
  });

  it('produces deterministic output for the same normalized Audit', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));

    expect(createOfflineHtmlReport(audit)).toBe(createOfflineHtmlReport(audit));
  });

  it('does not use browser network APIs when the report opens', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));
    const html = createOfflineHtmlReport(audit);

    expect(html.includes('fetch(')).toBe(false);
    expect(html.includes('XMLHttpRequest')).toBe(false);
    expect(html.includes('WebSocket')).toBe(false);
    expect(html.includes('EventSource')).toBe(false);
    expect(html.includes('navigator.sendBeacon')).toBe(false);
  });

  it('embeds every runtime stylesheet, script and static resource in the document', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));
    const html = createOfflineHtmlReport(audit);
    const externalTag = /<(?:script|link|img|source|iframe|audio|video)\\b[^>]*(?:src|href)\\s*=/i;
    const externalCss = /url\\(\\s*['"]?(?:https?:|\\/\\/)/i;

    expect(externalTag.test(html)).toBe(false);
    expect(externalCss.test(html)).toBe(false);
    expect(html.includes('sourceMappingURL=')).toBe(false);
    expect(html.includes('<style>')).toBe(true);
    expect(html.includes('<script>')).toBe(true);
  });
});

function removeEmbeddedPayload(html: string): string {
  const marker = '<script id="atlas-report-data" type="application/json">\\n';
  const start = html.indexOf(marker);
  if (start < 0) throw new Error('Missing embedded Atlas report payload.');
  const end = html.indexOf('\\n</script>', start + marker.length);
  if (end < 0) throw new Error('Missing embedded Atlas report payload terminator.');
  return html.slice(0, start) + html.slice(end + '\\n</script>'.length);
}

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
  readonly audit: {
    readonly evaluation: {
      readonly architecture: unknown;
      readonly cyclicPackages: unknown;
      readonly genericRules: unknown;
      readonly rules: unknown;
    };
    readonly meta: {
      readonly projectName: string;
    };
    readonly packageGraph: unknown;
    readonly sourceGraph: string;
    readonly sourceGraph: string;
  };
  readonly graph: {
    readonly edges: readonly unknown[];
    readonly nodes: readonly unknown[];
  };
  readonly tree: readonly unknown[];
}
