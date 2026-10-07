import { createDependencyGraphAsync } from '@ankhorage/dependency-graph';
import { assert, describe, expect, it, resolve } from '@artiphishle/testosterone';

import { projectDependencyImportsAsync } from '@/features/dependency-analysis/adapters/outbound/dependency-graph/projectDependencyImportsAsync';
import { readProjectSnapshotAsync } from '@/features/project-analysis/composition/readProjectSnapshotAsync';

describe('[Java dependency graph migration]', () => {
  it('rejects an analysis root outside the selected project', async () => {
    const projectRoot = resolve(process.cwd(), 'examples/java/my-app');
    const dependencyGraph = await createDependencyGraphAsync({
      projects: [{ id: 'current', rootPath: projectRoot }],
    });

    await assert.rejects(
      projectDependencyImportsAsync(
        dependencyGraph,
        projectRoot,
        resolve(process.cwd(), 'examples/typescript/my-app')
      ),
      /Path escaped the allowed root/
    );
  });

  it('uses canonical Java import evidence at the Java source-root boundary', async () => {
    const projectRoot = resolve(process.cwd(), 'examples/java/my-app');
    const analysisRoot = resolve(projectRoot, 'src/main/java');
    const dependencyGraph = await createDependencyGraphAsync({
      projects: [{ id: 'current', rootPath: projectRoot }],
    });
    const importsByFile = await projectDependencyImportsAsync(
      dependencyGraph,
      projectRoot,
      analysisRoot,
      'specifier'
    );

    expect(importsByFile.get('com/example/myapp/App.java')).toEqual([
      {
        name: 'com.example.myapp.a.A',
        pkg: 'com.example.myapp.a',
        isIntrinsic: true,
      },
    ]);
  });

  it('preserves the locked Java package dependency semantics from the owner graph', async () => {
    const projectRoot = resolve(process.cwd(), 'examples/java/my-app');
    const { packageGraph } = await readProjectSnapshotAsync(projectRoot);

    const weights = new Map(
      packageGraph.edges.map(edge => [`${edge.source}->${edge.target}`, edge.data.weight])
    );

    expect(weights.get('com.example.myapp->com.example.myapp.a')).toBe(1);
    expect(weights.get('com.example.myapp.a->com.example.myapp.b')).toBe(1);
    expect(weights.get('com.example.myapp.a->com.example.myapp.c')).toBe(1);
    expect(weights.get('com.example.myapp.a->com.example.myapp.d')).toBe(1);
    expect(weights.get('com.example.myapp.b->com.example.myapp.a')).toBe(1);
    expect(weights.has('com.example.myapp->junit.framework')).toBe(false);
    expect(packageGraph.edges.length).toBe(5);

    for (const packageName of [
      'com.example.myapp.a',
      'com.example.myapp.b',
      'com.example.myapp.c',
      'com.example.myapp.d',
    ]) {
      expect(
        packageGraph.nodes.some(node => node.id === packageName && node.data.isIntrinsic === true)
      ).toBe(true);
    }
  });
});
