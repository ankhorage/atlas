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
  abortController?: AbortController;
  readonly entries: Map<string, RepositoryAnalysis>;
  generation: number;
  repositories: readonly GitHubRepositoryDiscoveryRepository[];
  readonly source: string;
  readonly statuses: Map<string, WorkspaceRepositoryLoadStatus>;
}

export type WorkspaceRepositoryProgress = (
  result: WorkspaceRepositoryRuntimeResult
) => void | Promise<void>;

/*** Load one bounded batch and retain only credential-free workspace analysis results. */
export async function loadWorkspaceRepositoryBatchAsync(
  workspace: WorkspaceRuntimeState,
  repositories: readonly GitHubRepositoryDiscoveryRepository[],
  runtimeId: string,
  analyzeAsync: (
    repository: GitHubRepositoryDiscoveryRepository,
    signal?: AbortSignal
  ) => Promise<RepositoryAnalysis>,
  signal?: AbortSignal,
  onProgress?: WorkspaceRepositoryProgress
): Promise<WorkspaceRepositoryRuntimeResult> {
  const generation = workspace.generation + 1;
  workspace.generation = generation;
  for (const repository of repositories)
    workspace.statuses.set(repository.id, createWorkspaceRepositoryStatus(repository, 'loading'));
  await publishWorkspaceProgress(workspace, runtimeId, generation, onProgress);
  await settleBoundedAsync(repositories, 4, analyzeAsync, signal, async (repository, outcome) => {
    if (workspace.generation !== generation) return;
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
          isCancellation(outcome.reason) ? 'cancelled' : 'failed',
          outcome.reason
        )
      );
    }
    await publishWorkspaceProgress(workspace, runtimeId, generation, onProgress);
  });
  if (workspace.generation !== generation)
    throw new DOMException('A newer workspace operation superseded this one.', 'AbortError');
  return composeWorkspaceRepositoryRuntimeResult({
    entries: workspace.entries,
    repositories: workspace.repositories,
    runtimeId,
    source: workspace.source,
    statuses: workspace.statuses,
  });
}

/*** Publish a complete credential-free snapshot after each observable repository state transition. */
async function publishWorkspaceProgress(
  workspace: WorkspaceRuntimeState,
  runtimeId: string,
  generation: number,
  onProgress: WorkspaceRepositoryProgress | undefined
): Promise<void> {
  if (workspace.generation !== generation) return;
  await onProgress?.(
    composeWorkspaceRepositoryRuntimeResult({
      entries: workspace.entries,
      repositories: workspace.repositories,
      runtimeId,
      source: workspace.source,
      statuses: workspace.statuses,
    })
  );
}

/*** Keep deliberate cancellation distinct from a failed repository materialization. */
function isCancellation(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}
