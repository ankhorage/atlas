import {
  createSourceGraphFromInspectionsAsync,
  projectDependencyGraphFromInspections,
} from '@ankhorage/dependency-graph';
import type { GitHubRepositoryDiscoveryRepository } from '@ankhorage/repository/github';
import { toErrorMessage } from '@ankhorage/utility/error';

import { createAuditFromSnapshot } from '@/features/audit/application/use-cases/createAuditFromSnapshot';
import { projectDependencyGraph } from '@/features/dependency-analysis/application/use-cases/projectDependencyGraph';
import { inspectProjectForAnalysisAsync } from '@/features/project-analysis/adapters/outbound/project-detector/inspectProjectForAnalysisAsync';
import { loadProjectSnapshotAsync } from '@/features/project-analysis/composition/loadProjectSnapshotAsync';
import { hydrateWorkspaceSnapshot } from '@/features/workspace/application/use-cases/hydrateWorkspaceSnapshot';
import type { ProjectSnapshot } from '@/types/projectAnalysis';
import type { ProjectFileTree } from '@/types/projectFiles';
import type { ResolvedProjectSource } from '@/types/projectSource';
import type { WorkspaceLoadResult } from '@/types/workspace';

/*** Analyze selected repositories together through the canonical multi-project dependency pipeline. */
export async function loadMultiProjectWorkspaceAsync(
  projects: readonly MultiProjectWorkspaceProject[]
): Promise<WorkspaceLoadResult> {
  try {
    if (projects.length === 0) throw new Error('No GitHub repositories are selected.');
    const inspected = await Promise.all(
      projects.map(async project => ({
        id: project.repository.id,
        inspection: await inspectProjectForAnalysisAsync(project.resolved.rootPath),
        project,
      }))
    );
    const graphProjects = inspected.map(({ id, inspection }) => ({ id, inspection }));
    const sourceGraph = await createSourceGraphFromInspectionsAsync({ projects: graphProjects });
    const dependencyGraph = projectDependencyGraphFromInspections(sourceGraph, graphProjects);
    const snapshots = await Promise.all(
      inspected.map(({ inspection, project }) =>
        loadProjectSnapshotAsync(project.resolved.rootPath, dependencyGraph, inspection)
      )
    );
    const snapshot = createMultiProjectSnapshot(snapshots, sourceGraph, dependencyGraph);
    return {
      ok: true,
      value: hydrateWorkspaceSnapshot({ audit: createAuditFromSnapshot(snapshot), version: 1 }),
    };
  } catch (error) {
    return {
      ok: false,
      error: toErrorMessage(error, 'Unable to load selected GitHub repositories.'),
    };
  }
}

/*** Merge display trees while preserving each repository as an explicit virtual root. */
function createMultiProjectSnapshot(
  snapshots: readonly ProjectSnapshot[],
  sourceGraph: ProjectSnapshot['sourceGraph'],
  dependencyGraph: Parameters<typeof projectDependencyGraph>[0]
): ProjectSnapshot {
  const first = snapshots.at(0);
  if (first === undefined) throw new Error('No project snapshots were available.');
  return {
    ...first,
    files: mergeProjectFiles(snapshots),
    packageGraph: projectDependencyGraph(dependencyGraph),
    sourceGraph,
  };
}

/*** Give each filesystem tree a stable repository root before passing it to the existing TreeView. */
function mergeProjectFiles(snapshots: readonly ProjectSnapshot[]): ProjectFileTree {
  return Object.fromEntries(
    snapshots.map(snapshot => [
      snapshot.projectPath.split('/').at(-1) ?? snapshot.projectPath,
      snapshot.files,
    ])
  );
}

export interface MultiProjectWorkspaceProject {
  readonly repository: GitHubRepositoryDiscoveryRepository;
  readonly resolved: ResolvedProjectSource;
}
