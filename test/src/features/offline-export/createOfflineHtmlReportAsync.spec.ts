import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { deserializeSourceGraph, serializeSourceGraph } from '@ankhorage/dependency-graph';
import { assert, describe, expect, it } from '@artiphishle/testosterone';

import { createAuditAsync } from '@/features/audit/composition/createAuditAsync';
import { createOfflineHtmlReportAsync } from '@/features/offline-export/application/createOfflineHtmlReportAsync';
import type { ProjectFileMetadata, ProjectFileTree } from '@/types/projectFiles';
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

  it('rejects absolute host paths from every typed Audit source-path field', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));
    const pathVariants = [
      '/root/.ssh/id_rsa',
      'C:\\workspace\\secret',
      '\\\\server\\share\\secret',
      'file:///private/tmp/secret',
      'file:/private/tmp/secret',
    ];

    await Promise.all(
      pathVariants.flatMap(path => [
        assert.rejects(
          createOfflineHtmlReportAsync({
            ...audit,
            files: replaceProjectFilePaths(audit.files, path),
          }),
          /host path/i
        ),
        assert.rejects(
          createOfflineHtmlReportAsync({
            ...audit,
            packageGraph: {
              ...audit.packageGraph,
              nodes: audit.packageGraph.nodes.map((node, index) =>
                index === 0 ? { ...node, data: { ...node.data, path } } : node
              ),
            },
          }),
          /host path/i
        ),
        assert.rejects(
          createOfflineHtmlReportAsync({
            ...audit,
            packageGraph: {
              ...audit.packageGraph,
              edges: audit.packageGraph.edges.map((edge, edgeIndex) =>
                edgeIndex === 0
                  ? {
                      ...edge,
                      data: {
                        ...edge.data,
                        evidence: edge.data.evidence.map((evidence, evidenceIndex) =>
                          evidenceIndex === 0 ? { ...evidence, sourceFile: path } : evidence
                        ),
                      },
                    }
                  : edge
              ),
            },
          }),
          /host path/i
        ),
      ])
    );
  });

  it('rejects SourceGraph path facts while preserving its logical identities', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));
    const sourceGraph = deserializeSourceGraph(audit.sourceGraph);
    const serializedSourceGraph = serializeSourceGraph({
      ...sourceGraph,
      graph: {
        ...sourceGraph.graph,
        nodes: sourceGraph.graph.nodes.map((node, index) =>
          index === 0 ? { ...node, data: { ...node.data, path: '/etc/atlas/private' } } : node
        ),
        edges: sourceGraph.graph.edges.map((edge, edgeIndex) =>
          edgeIndex === 0
            ? {
                ...edge,
                data: {
                  ...edge.data,
                  evidence: edge.data.evidence.map((evidence, evidenceIndex) =>
                    evidenceIndex === 0
                      ? { ...evidence, sourcePath: 'file:///private/tmp/secret' }
                      : evidence
                  ),
                },
              }
            : edge
        ),
      },
    });

    await assert.rejects(
      createOfflineHtmlReportAsync({ ...audit, sourceGraph: serializedSourceGraph }),
      /host path/i
    );
  });

  it('retains relative Audit paths and SourceGraph package identities', async () => {
    const audit = await createAuditAsync(resolve(process.cwd(), 'examples/java/my-app'));
    const html = await createOfflineHtmlReportAsync({
      ...audit,
      files: replaceProjectFilePaths(audit.files, 'src/main/java/Example.java'),
      packageGraph: {
        ...audit.packageGraph,
        nodes: audit.packageGraph.nodes.map((node, index) =>
          index === 0 ? { ...node, data: { ...node.data, path: 'com.example' } } : node
        ),
        edges: audit.packageGraph.edges.map((edge, edgeIndex) =>
          edgeIndex === 0
            ? {
                ...edge,
                data: {
                  ...edge.data,
                  evidence: edge.data.evidence.map((evidence, evidenceIndex) =>
                    evidenceIndex === 0
                      ? { ...evidence, sourceFile: 'src/main/java/Example.java' }
                      : evidence
                  ),
                },
              }
            : edge
        ),
      },
    });

    const snapshot = deserializeWorkspaceSnapshot(readSnapshot(html));
    expect(snapshot.audit.packageGraph.nodes[0]?.data.path).toBe('com.example');
    expect(snapshot.audit.packageGraph.edges[0]?.data.evidence[0]?.sourceFile).toBe(
      'src/main/java/Example.java'
    );
  });
});

/*** Replaces source-file leaf paths while preserving the tree's typed directory hierarchy. */
function replaceProjectFilePaths(tree: ProjectFileTree, path: string): ProjectFileTree {
  return Object.fromEntries(
    Object.entries(tree).map(([name, entry]) => [
      name,
      isProjectFileMetadata(entry) ? { ...entry, path } : replaceProjectFilePaths(entry, path),
    ])
  );
}

/*** Distinguishes a ProjectFileMetadata leaf from a nested source directory. */
function isProjectFileMetadata(
  value: ProjectFileTree | ProjectFileMetadata
): value is ProjectFileMetadata {
  return 'path' in value && typeof value.path === 'string' && 'imports' in value;
}

/*** Reads the exact JSON boundary that the browser bootstrap validates before rendering. */
function readSnapshot(html: string): string {
  const startMarker = '<script id="atlas-workspace-snapshot" type="application/json">\n';
  const start = html.indexOf(startMarker);
  const end = html.indexOf('\n</script>', start + startMarker.length);
  if (start < 0 || end < 0) throw new Error('Missing embedded Atlas workspace snapshot.');
  return html.slice(start + startMarker.length, end);
}
