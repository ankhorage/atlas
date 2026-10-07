import { resolve } from 'node:path';

import { assert, describe, it } from '@artiphishle/testosterone';

import { requestDependencyGraphAsync } from '@/features/dependency-analysis/adapters/outbound/api/requestDependencyGraphAsync';
import { projectDependencyGraph } from '@/features/dependency-analysis/application/use-cases/projectDependencyGraph';
import { inspectProjectForAnalysisAsync } from '@/features/project-analysis/adapters/outbound/project-detector/inspectProjectForAnalysisAsync';
import { readProjectSnapshotAsync } from '@/features/project-analysis/composition/readProjectSnapshotAsync';

describe('[requestDependencyGraphAsync]', () => {
  it('matches the direct five-edge Java topology through the canonical action', async () => {
    const projectPath = resolve('examples/java/my-app');
    const inspection = await inspectProjectForAnalysisAsync(projectPath);
    const graph = await requestDependencyGraphAsync(inspection);
    const apiPackageGraph = projectDependencyGraph(graph);
    const { packageGraph: directPackageGraph } = await readProjectSnapshotAsync(projectPath);

    assert.equal(apiPackageGraph.edges.length, 5);
    assert.equal(
      apiPackageGraph.edges.some(edge => edge.target === 'junit.framework'),
      false
    );
    assert.deepEqual(apiPackageGraph, directPackageGraph);
  });
});
