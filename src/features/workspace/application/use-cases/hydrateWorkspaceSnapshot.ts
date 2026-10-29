import { buildProjectTree } from '@/features/project-tree/application/use-cases/buildProjectTree';
import type { ProjectOverview, WorkspaceSnapshot } from '@/types/workspace';

/*** Rebuilds the workspace view model from the portable Audit without host-specific analysis. */
export function hydrateWorkspaceSnapshot(snapshot: WorkspaceSnapshot): ProjectOverview {
  return {
    evaluation: snapshot.audit.evaluation,
    packageGraph: snapshot.audit.packageGraph,
    projectIdentity: createProjectIdentity(snapshot),
    tree: buildProjectTree(snapshot.audit.files),
  };
}

/*** Creates a stable browser-safe scope for workspace preferences without exposing a local path. */
function createProjectIdentity(snapshot: WorkspaceSnapshot): string {
  const { source } = snapshot.audit.meta;
  if (source !== undefined) return `github:${source.url}@${source.revision}`;
  const fingerprint = Array.from(
    JSON.stringify({ files: snapshot.audit.files, graph: snapshot.audit.packageGraph })
  ).reduce((hash, character) => ((hash ^ character.charCodeAt(0)) * 16777619) >>> 0, 2166136261);
  return `snapshot:${fingerprint.toString(36)}`;
}
