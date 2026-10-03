import { deserializeSourceGraph } from '@ankhorage/dependency-graph';
import { toCytoscapeElements } from '@ankhorage/graph-cytoscape';
import { describe, expect, it } from '@artiphishle/testosterone';
import { resolve } from 'node:path';

import { createAuditAsync } from '@/features/audit/composition/createAuditAsync';
import { createOfflineHtmlReport } from '@/features/offline-report/application/createOfflineHtmlReport';

describe('[createOfflineHtmlReport]', () => {
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
});

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
  };
  readonly graph: {
    readonly edges: readonly unknown[];
    readonly nodes: readonly unknown[];
  };
  readonly tree: readonly unknown[];
}
