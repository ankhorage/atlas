import type { GitHubRepositoryDiscoveryRepository } from '@ankhorage/repository/github';

import type {
  RepositoryAnalysis,
  WorkspaceRepositoryRuntimeResult,
} from '@/features/workspace/composition/composeWorkspaceRepositoryRuntimeResult';
import { composeWorkspaceRepositoryRuntimeResult } from '@/features/workspace/composition/composeWorkspaceRepositoryRuntimeResult';
import { createWorkspaceRepositoryStatus } from '@/features/workspace/composition/createWorkspaceRepositoryStatus';
import { settleBoundedAsync } from '@/features/workspace/utils/settleBoundedAsync';
import type { WorkspaceRepositoryLoadStatus } from '@/types/workspace';

export interface WorkspaceRuntimeState {
  active: boolean;
  readonly entries: Map<string, RepositoryAnalysis>;
  generation: number;
  readonly repositories: readonly GitHubRepositoryDiscoveryRepository[];
  readonly source: string;
  readonly statuses: Map<string, WorkspaceRepositoryLoadStatus>;
}

/*** Load one bounded batch and retain only credential-free workspace analysis results. */
export async function loadWorkspaceRepositoryBatchAsync(
  workspace: WorkspaceRuntimeState,
  repositories: readonly GitHubRepositoryDiscoveryRepository[],
  runtimeId: string,
  analyzeAsync: (
    repository: GitHubRepositoryDiscoveryRepository,
    signal?: AbortSignal
  ) => Promise<RepositoryAnalysis>,
  signal?: AbortSignal
): Promise<WorkspaceRepositoryRuntimeResult> {
  const generation = workspace.generation + 1;
  workspace.generation = generation;
  const outcomes = await settleBoundedAsync(repositories, 4, analyzeAsync, signal);
  if (workspace.generation !== generation)
    throw new DOMException('A newer workspace operation superseded this one.', 'AbortError');
  for (const [index, outcome] of outcomes.entries()) {
    const repository = repositories.at(index);
    if (repository === undefined) continue;
    if (outcome.status === 'fulfilled') {
      workspace.entries.set(repository.id, outcome.value);
      workspace.statuses.set(
        repository.id,
        createWorkspaceRepositoryStatus(repository, 'successful')
      );
    } else {
      workspace.statuses.set(
        repository.id,
        createWorkspaceRepositoryStatus(
          repository,
          isCancellation(outcome.reason) ? 'cancelled' : 'failed'
        )
      );
    }
  }
  return composeWorkspaceRepositoryRuntimeResult({
    entries: workspace.entries,
    repositories: workspace.repositories,
    runtimeId,
    source: workspace.source,
    statuses: workspace.statuses,
  });
}

/*** Keep deliberate cancellation distinct from a failed repository materialization. */
function isCancellation(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}
