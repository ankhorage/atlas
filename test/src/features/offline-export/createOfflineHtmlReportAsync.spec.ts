import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { assert, describe, expect, it } from '@artiphishle/testosterone';

import { createAuditAsync } from '@/features/audit/composition/createAuditAsync';
import { createOfflineHtmlReportAsync } from '@/features/offline-export/application/createOfflineHtmlReportAsync';
import { deserializeWorkspaceSnapshot } from '@/features/workspace/application/use-cases/deserializeWorkspaceSnapshot';

describe('[createOfflineHtmlReportAsync]', () => {
  it('embeds the release-built React workspace and a safely encoded canonical snapshot', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));
    const html = await createOfflineHtmlReportAsync({
      ...audit,
      meta: { ...audit.meta, projectName: '</script><script>globalThis.compromised=true</script>' },
    });

    expect(html.includes('atlas-offline-root')).toBe(true);
    expect(html.includes('atlas-workspace-snapshot')).toBe(true);
    expect(html.includes('globalThis.compromised=true</script>')).toBe(false);
    expect(html.includes('\\u003c/script\\u003e')).toBe(true);
    expect(html.includes("connect-src 'none'")).toBe(true);
    expect(deserializeWorkspaceSnapshot(readSnapshot(html)).audit.meta.projectName).toBe(
      '</script><script>globalThis.compromised=true</script>'
    );
  });

  it('contains exactly the release-built browser resources', async () => {
    const html = await createOfflineHtmlReportAsync(
      await createAuditAsync(resolve(process.cwd(), 'examples/typescript/my-app'))
    );
    const bundle = await readFile(resolve(process.cwd(), 'offline/atlas-workspace.js'), 'utf8');

    expect(html.includes(bundle.replace(/<\/script/giu, '<\\/script'))).toBe(true);
    const markup = html.slice(0, html.indexOf('<script id="atlas-workspace-snapshot"'));
    expect(/<script[^>]+\bsrc=/i.test(markup)).toBe(false);
    expect(/<link[^>]+\bhref=/i.test(markup)).toBe(false);
    expect(/<(?:img|iframe|audio|video|source)[^>]+\bsrc=/i.test(markup)).toBe(false);
  });

  it('retains project-relative provenance and an explicitly selected public repository URL', async () => {
    const html = await createOfflineHtmlReportAsync(
      await createAuditAsync(
        resolve(process.cwd(), 'examples/java/my-app'),
        {},
        {
          source: {
            kind: 'github',
            revision: '0123456789abcdef',
            url: 'https://github.com/ankhorage/atlas/tree/main',
          },
        }
      )
    );

    const snapshot = deserializeWorkspaceSnapshot(readSnapshot(html));
    expect(snapshot.audit.meta.source?.url).toBe('https://github.com/ankhorage/atlas/tree/main');
    expect(Object.keys(snapshot.audit.files)).toContain('com');
  });

  it('rejects absolute POSIX, Windows, UNC, and file host paths plus credential-bearing values', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));
    const cases = [
      { projectName: '/private/tmp/atlas-project' },
      { projectName: '/opt/ankhorage/private/project' },
      { projectName: '/etc/atlas/credentials' },
      { projectName: '/root/.ssh/id_rsa' },
      { projectName: '/mnt/data/private' },
      { projectName: 'C:\\Users\\atlas\\project' },
      { projectName: 'D:\\Projects\\secret' },
      { projectName: 'C:/workspace/atlas' },
      { projectName: '\\\\server\\share\\project' },
      { projectName: 'file:///private/tmp/atlas-project' },
      { projectName: 'file:/tmp/secret' },
      { projectName: 'token=not-for-export' },
      {
        source: {
          kind: 'github' as const,
          revision: '0123456789abcdef',
          url: 'https://token@github.com/ankhorage/atlas',
        },
      },
    ];

    await Promise.all(
      cases.map(entry =>
        assert.rejects(
          createOfflineHtmlReportAsync({ ...audit, meta: { ...audit.meta, ...entry } }),
          /host path|sensitive data|public HTTPS GitHub repository URL/i
        )
      )
    );
  });

  it('retains relative source evidence and SourceGraph identities', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));
    const html = await createOfflineHtmlReportAsync({
      ...audit,
      evaluation: {
        ...audit.evaluation,
        cyclicPackages: [
          {
            packages: ['com.example.alpha', 'com.example.beta', 'com.example.alpha'],
            edges: [
              {
                from: 'com.example.alpha',
                to: 'com.example.beta',
                via: [
                  { fileClass: 'source', filePath: 'src/main/java/Alpha.java', importName: 'Beta' },
                ],
              },
            ],
          },
        ],
      },
    });

    const snapshot = deserializeWorkspaceSnapshot(readSnapshot(html));
    expect(snapshot.audit.evaluation.cyclicPackages[0]?.edges[0]?.via[0]?.filePath).toBe(
      'src/main/java/Alpha.java'
    );
    expect(snapshot.audit.sourceGraph).toBe(audit.sourceGraph);
  });
});

/*** Reads the exact JSON boundary that the browser bootstrap validates before rendering. */
function readSnapshot(html: string): string {
  const startMarker = '<script id="atlas-workspace-snapshot" type="application/json">\n';
  const start = html.indexOf(startMarker);
  const end = html.indexOf('\n</script>', start + startMarker.length);
  if (start < 0 || end < 0) throw new Error('Missing embedded Atlas workspace snapshot.');
  return html.slice(start + startMarker.length, end);
}
