import { createAuditFromSnapshot } from '@/features/audit/application/use-cases/createAuditFromSnapshot';
import { loadProjectSnapshotAsync } from '@/features/project-analysis/composition/loadProjectSnapshotAsync';
import { buildProjectTree } from '@/features/project-tree/application/use-cases/buildProjectTree';
import type { ProjectOverview } from '@/types/workspace';

/*** Composes the project analysis, tree, and audit views used by the active Atlas workspace. */
export async function loadProjectOverviewAsync(
  projectPath: string,
  dependencyGraph: DependencyGraph
): Promise<ProjectOverview> {
  const snapshot = await loadProjectSnapshotAsync(projectPath, dependencyGraph);
  return {
    packageGraph: snapshot.packageGraph,
    tree: buildProjectTree(snapshot.files),
    evaluation: createAuditFromSnapshot(snapshot).evaluation,
  };
}
import type { DependencyGraph } from '@ankhorage/dependency-graph';
