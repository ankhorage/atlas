import type { DependencyGraph } from '@ankhorage/dependency-graph';
import type { ProjectInspection } from '@ankhorage/project-detector/types';
import { toErrorMessage } from '@ankhorage/utility/error';

import { inspectProjectForAnalysisAsync } from '@/features/project-analysis/adapters/outbound/project-detector/inspectProjectForAnalysisAsync';
import { loadProjectOverviewAsync } from '@/features/workspace/composition/loadProjectOverviewAsync';
import type { WorkspaceLoadResult } from '@/types/workspace';

/*** Loads the active workspace while serializing project failures for the persistent error UI. */
export async function loadWorkspaceAsync(
  projectPath: string,
  loadDependencyGraphAsync: (inspection: ProjectInspection) => Promise<DependencyGraph>
): Promise<WorkspaceLoadResult> {
  try {
    const inspection = await inspectProjectForAnalysisAsync(projectPath);
    const dependencyGraph = await loadDependencyGraphAsync(inspection);
    return {
      ok: true,
      value: await loadProjectOverviewAsync(projectPath, dependencyGraph, inspection),
    };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error, 'Unable to load project.') };
  }
}
