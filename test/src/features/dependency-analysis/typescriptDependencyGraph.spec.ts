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
    const { packageGraph } = await readProjectSnapshotAsync({ projectPath: projectRoot });

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
});
