import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createDependencyGraphAsync } from '@ankhorage/dependency-graph';
import { describe, expect, it, resolve } from '@artiphishle/testosterone';

import { projectDependencyImportsAsync } from '@/features/dependency-analysis/adapters/outbound/dependency-graph/projectDependencyImportsAsync';
import { readProjectSnapshotAsync } from '@/features/project-analysis/composition/readProjectSnapshotAsync';

describe('[TypeScript dependency graph migration]', () => {
  it('preserves PKGViz import semantics from the canonical dependency analyzer', async () => {
    const projectRoot = resolve(process.cwd(), 'examples/typescript/my-app');
    const dependencyGraph = await createDependencyGraphAsync({
      projects: [{ id: 'current', rootPath: projectRoot }],
    });
    const importsByFile = await projectDependencyImportsAsync(dependencyGraph, projectRoot);

    const rootImports = importsByFile.get('src/index.tsx') ?? [];
    const componentImports = importsByFile.get('src/components/A.tsx') ?? [];

    expect(rootImports.length).toBe(2);
    expect(rootImports[0]).toEqual({
      name: 'src.components',
      pkg: 'src.components',
      isIntrinsic: true,
    });
    expect(rootImports[1]).toEqual({
      name: 'src.components',
      pkg: 'src.components',
      isIntrinsic: true,
    });
    expect(componentImports).toEqual([{ name: 'next', pkg: 'next', isIntrinsic: false }]);
  });

  it('keeps the existing PKGViz package graph output from the owner graph', async () => {
    const projectRoot = resolve(process.cwd(), 'examples/typescript/my-app');
    const { packageGraph } = await readProjectSnapshotAsync(projectRoot);

    const rootToComponents = packageGraph.edges.find(
      edge => edge.source === 'src' && edge.target === 'src.components'
    );
    const componentsToNext = packageGraph.edges.find(
      edge => edge.source === 'src.components' && edge.target === 'next'
    );

    expect(rootToComponents?.data.weight).toBe(2);
    expect(componentsToNext?.data.weight).toBe(1);
    expect(packageGraph.nodes.some(node => node.id === 'src.components')).toBe(true);
    expect(
      packageGraph.nodes.some(node => node.id === 'next' && node.data.isIntrinsic !== true)
    ).toBe(true);
  });

  it('keeps declared vendor roots stable while resolving aliases from the canonical SourceGraph', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'pkgviz-vendor-roots-'));

    try {
      await mkdir(join(projectRoot, 'src', 'internal'), { recursive: true });
      await writeFile(
        join(projectRoot, 'package.json'),
        JSON.stringify({
          name: 'vendor-root-fixture',
          dependencies: {
            '@ankhorage/zora': '*',
            react: '*',
          },
        })
      );
      await writeFile(
        join(projectRoot, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            module: 'esnext',
            moduleResolution: 'bundler',
            paths: {
              '@/*': ['./src/*'],
            },
          },
          include: ['src/**/*.ts'],
        })
      );
      await writeFile(
        join(projectRoot, 'src', 'main.ts'),
        [
          "import 'react/jsx-runtime';",
          "import '@ankhorage/zora/tree-view';",
          "import '@/internal/value';",
          "import '@/missing';",
          '',
        ].join('\n')
      );
      await writeFile(join(projectRoot, 'src', 'internal', 'value.ts'), 'export const value = 1;\n');

      const { packageGraph, sourceGraph } = await readProjectSnapshotAsync(projectRoot);
      const nodes = new Map(packageGraph.nodes.map(node => [node.id, node.data]));

      expect(nodes.get('react')?.classification).toBe('vendor');
      expect(nodes.get('@ankhorage/zora')?.classification).toBe('vendor');
      expect(nodes.has('react/jsx-runtime')).toBe(false);
      expect(nodes.has('@ankhorage/zora/tree-view')).toBe(false);
      expect(nodes.get('src.internal')?.classification).toBe('intrinsic');
      expect(nodes.get('@/missing')?.classification).toBe('unknown');

      const edges = new Map(
        packageGraph.edges.map(edge => [`${edge.source}->${edge.target}`, edge.data])
      );
      expect(edges.get('src->react')?.weight).toBe(1);
      expect(edges.get('src->react')?.evidence[0]?.specifier).toBe('react/jsx-runtime');
      expect(edges.get('src->@ankhorage/zora')?.weight).toBe(1);
      expect(edges.get('src->@ankhorage/zora')?.evidence[0]?.specifier).toBe(
        '@ankhorage/zora/tree-view'
      );
      expect(edges.get('src->src.internal')?.evidence[0]?.classification).toBe('intrinsic');
      expect(edges.get('src->@/missing')?.evidence[0]?.classification).toBe('unknown');

      const sourceSpecifiers = sourceGraph.graph.edges
        .filter(edge => edge.data.kind === 'imports')
        .flatMap(edge => edge.data.evidence.map(item => item.specifier));

      expect(sourceSpecifiers).toContain('react/jsx-runtime');
      expect(sourceSpecifiers).toContain('@ankhorage/zora/tree-view');
      expect(sourceSpecifiers).toContain('@/internal/value');
      expect(sourceSpecifiers).toContain('@/missing');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
