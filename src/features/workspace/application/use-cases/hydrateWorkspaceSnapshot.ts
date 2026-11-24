import { deserializeSourceGraph } from '@ankhorage/dependency-graph';

import { addSourceFeatureNavigation } from '@/features/project-tree/application/use-cases/addSourceFeatureNavigation';
import { buildProjectTree } from '@/features/project-tree/application/use-cases/buildProjectTree';
import type { ProjectOverview, WorkspaceSnapshot } from '@/types/workspace';

/*** Rebuilds the workspace view model from the portable Audit without host-specific analysis. */
export function hydrateWorkspaceSnapshot(snapshot: WorkspaceSnapshot): ProjectOverview {
  return {
    evaluation: snapshot.audit.evaluation,
    packageGraph: snapshot.audit.packageGraph,
    projectIdentity: createProjectIdentity(snapshot),
    tree: snapshot.navigationTree ?? localNavigationTree(snapshot),
  };
}

/*** Retain the project name as a selectable top-level tree folder for local analyses. */
function localNavigationTree(snapshot: WorkspaceSnapshot) {
  const children = addSourceFeatureNavigation(
    buildProjectTree(snapshot.audit.files),
    deserializeSourceGraph(snapshot.audit.sourceGraph)
  );
  if (children.length === 0) return children;
  return [
    {
      children,
      graphPackage: '',
      id: 'project:root',
      kind: 'virtual' as const,
      label: snapshot.audit.meta.projectName,
    },
  ];
}

/*** Creates a stable browser-safe scope for workspace preferences without exposing a local path. */
function createProjectIdentity(snapshot: WorkspaceSnapshot): string {
  if (snapshot.audit.meta.workspaceIdentity !== undefined)
    return snapshot.audit.meta.workspaceIdentity;
  const { source } = snapshot.audit.meta;
  if (source !== undefined) return `github:${source.url}@${source.revision}`;
  const fingerprint = Array.from(
    JSON.stringify({ files: snapshot.audit.files, graph: snapshot.audit.packageGraph })
  ).reduce((hash, character) => ((hash ^ character.charCodeAt(0)) * 16777619) >>> 0, 2166136261);
  return `snapshot:${fingerprint.toString(36)}`;
}
