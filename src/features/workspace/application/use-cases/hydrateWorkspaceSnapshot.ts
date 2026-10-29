import { buildProjectTree } from '@/features/project-tree/application/use-cases/buildProjectTree';
import type { ProjectOverview, WorkspaceSnapshot } from '@/types/workspace';

/*** Rebuilds the workspace view model from the portable Audit without host-specific analysis. */
export function hydrateWorkspaceSnapshot(snapshot: WorkspaceSnapshot): ProjectOverview {
  return {
    evaluation: snapshot.audit.evaluation,
    packageGraph: snapshot.audit.packageGraph,
    tree: buildProjectTree(snapshot.audit.files),
  };
}
