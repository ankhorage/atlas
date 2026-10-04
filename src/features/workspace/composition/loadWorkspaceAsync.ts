import { toErrorMessage } from '@ankhorage/utility/error';

import { loadProjectOverviewAsync } from '@/features/workspace/composition/loadProjectOverviewAsync';
import type { WorkspaceLoadResult } from '@/types/workspace';

/*** Loads the active workspace while serializing project failures for the persistent error UI. */
export async function loadWorkspaceAsync(
  projectPath: string,
  dependencyGraph: DependencyGraph
): Promise<WorkspaceLoadResult> {
  try {
    return { ok: true, value: await loadProjectOverviewAsync(projectPath, dependencyGraph) };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error, 'Unable to load project.') };
  }
}
import type { DependencyGraph } from '@ankhorage/dependency-graph';
