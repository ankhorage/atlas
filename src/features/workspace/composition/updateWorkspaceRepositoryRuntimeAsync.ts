import type { WorkspaceAnalysisCache } from '@/features/workspace/application/use-cases/createWorkspaceAnalysisCache';
import {
  composeWorkspaceRepositoryRuntimeResult,
  type RepositoryAnalysis,
  type WorkspaceRepositoryRuntimeResult,
} from '@/features/workspace/composition/composeWorkspaceRepositoryRuntimeResult';
import type {
  WorkspaceRepositoryAuthorization,
  WorkspaceRepositoryRuntimeDependencies,
  WorkspaceRepositoryRuntimeUpdate,
} from '@/features/workspace/composition/createWorkspaceRepositoryRuntime';
import {
  loadWorkspaceRepositoriesAsync,
  runWorkspaceOperationAsync,
  WorkspaceRepositoryRuntimeError,
} from '@/features/workspace/composition/createWorkspaceRepositoryRuntime';
import type { WorkspaceRuntimeState } from '@/features/workspace/composition/loadWorkspaceRepositoryBatchAsync';

/*** Apply a selection diff without re-analyzing retained repositories or reviving stale results. */
export async function updateWorkspaceRepositoryRuntimeAsync(
  workspaces: Map<string, WorkspaceRuntimeState>,
  cache: WorkspaceAnalysisCache<RepositoryAnalysis>,
  dependencies: WorkspaceRepositoryRuntimeDependencies,
  runtimeId: string,
  input: WorkspaceRepositoryRuntimeUpdate,
  authorization: WorkspaceRepositoryAuthorization,
  signal?: AbortSignal
): Promise<WorkspaceRepositoryRuntimeResult> {
  const workspace = workspaces.get(runtimeId);
  if (workspace === undefined)
    throw new WorkspaceRepositoryRuntimeError(
      'unavailable',
      'The workspace runtime is no longer available. Reload it to continue.'
    );
  const known = new Map(workspace.repositories.map(repository => [repository.id, repository]));
  for (const repository of input.addedRepositories) known.set(repository.id, repository);
  const removed = new Set(input.removedRepositoryIds);
  workspace.generation += 1;
  workspace.repositories = [...known.values()].filter(repository => !removed.has(repository.id));
  for (const id of removed) {
    workspace.entries.delete(id);
    workspace.statuses.delete(id);
  }
  const additions = input.addedRepositories.filter(repository => !removed.has(repository.id));
  if (additions.length === 0) return publishRemovedWorkspace(workspace, runtimeId, input);
  return runWorkspaceOperationAsync<WorkspaceRepositoryRuntimeResult>(
    workspace,
    operationSignal =>
      loadWorkspaceRepositoriesAsync(
        workspace,
        additions,
        runtimeId,
        cache,
        dependencies,
        authorization,
        operationSignal,
        input.onProgress
      ),
    signal,
    true
  );
}

/*** Publish a removal-only update without starting a redundant materialization operation. */
async function publishRemovedWorkspace(
  workspace: WorkspaceRuntimeState,
  runtimeId: string,
  input: WorkspaceRepositoryRuntimeUpdate
) {
  const result = composeWorkspaceRepositoryRuntimeResult({
    entries: workspace.entries,
    repositories: workspace.repositories,
    runtimeId,
    source: workspace.source,
    statuses: workspace.statuses,
  });
  await input.onProgress?.(result);
  return result;
}
