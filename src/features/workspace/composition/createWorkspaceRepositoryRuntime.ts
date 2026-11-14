import { randomUUID } from 'node:crypto';

import type { ProjectInspection } from '@ankhorage/project-detector/types';
import type {
  GitHubRepositoryAuthentication,
  GitHubRepositoryDiscoveryRepository,
} from '@ankhorage/repository/github';

import {
  createWorkspaceAnalysisCache,
  type WorkspaceAnalysisCache,
} from '@/features/workspace/application/use-cases/createWorkspaceAnalysisCache';
import { analyzeWorkspaceRepositoryAsync } from '@/features/workspace/composition/analyzeWorkspaceRepositoryAsync';
import type {
  RepositoryAnalysis,
  WorkspaceRepositoryRuntimeResult,
} from '@/features/workspace/composition/composeWorkspaceRepositoryRuntimeResult';
import type {
  WorkspaceRepositoryProgress,
  WorkspaceRuntimeState,
} from '@/features/workspace/composition/loadWorkspaceRepositoryBatchAsync';
import { loadWorkspaceRepositoryBatchAsync } from '@/features/workspace/composition/loadWorkspaceRepositoryBatchAsync';
import { updateWorkspaceRepositoryRuntimeAsync } from '@/features/workspace/composition/updateWorkspaceRepositoryRuntimeAsync';
import type { ProjectSource, ResolvedProjectSource } from '@/types/projectSource';

/*** Own process-local GitHub workspace state and revision-keyed portable analysis snapshots. */
export function createWorkspaceRepositoryRuntime(
  dependencies: WorkspaceRepositoryRuntimeDependencies
): WorkspaceRepositoryRuntime {
  const cache = dependencies.cache ?? createWorkspaceAnalysisCache<RepositoryAnalysis>(32);
  const workspaces = new Map<string, WorkspaceRuntimeState>();

  return createWorkspaceRuntimeActions(workspaces, cache, dependencies);
}

/*** Bind non-secret retained workspace state to request-scoped operations. */
function createWorkspaceRuntimeActions(
  workspaces: Map<string, WorkspaceRuntimeState>,
  cache: WorkspaceAnalysisCache<RepositoryAnalysis>,
  dependencies: WorkspaceRepositoryRuntimeDependencies
): WorkspaceRepositoryRuntime {
  return {
    loadAsync: (input, signal) =>
      loadWorkspaceRuntimeAsync(workspaces, cache, dependencies, input, signal),
    retryAsync: (runtimeId, repositoryId, authorization, signal) =>
      retryWorkspaceRuntimeAsync(
        workspaces,
        cache,
        dependencies,
        runtimeId,
        repositoryId,
        authorization ?? anonymousAuthorization,
        signal
      ),
    updateAsync: (runtimeId, input, authorization, signal) =>
      updateWorkspaceRepositoryRuntimeAsync(
        workspaces,
        cache,
        dependencies,
        runtimeId,
        input,
        authorization ?? anonymousAuthorization,
        signal
      ),
  };
}

/*** Start one workspace analysis without retaining its request credential. */
async function loadWorkspaceRuntimeAsync(
  workspaces: Map<string, WorkspaceRuntimeState>,
  cache: WorkspaceAnalysisCache<RepositoryAnalysis>,
  dependencies: WorkspaceRepositoryRuntimeDependencies,
  input: WorkspaceRepositoryRuntimeInput,
  signal?: AbortSignal
) {
  const workspace = runtimeWorkspace(input);
  const runtimeId = randomUUID();
  retainWorkspace(workspaces, runtimeId, workspace);
  return runWorkspaceOperationAsync(
    workspace,
    operationSignal =>
      loadWorkspaceRepositoriesAsync(
        workspace,
        input.repositories,
        runtimeId,
        cache,
        dependencies,
        workspaceRepositoryAuthorization(input),
        operationSignal,
        input.onProgress
      ),
    signal
  );
}

/*** Retry a retained repository with authorization supplied for this request only. */
async function retryWorkspaceRuntimeAsync(
  workspaces: Map<string, WorkspaceRuntimeState>,
  cache: WorkspaceAnalysisCache<RepositoryAnalysis>,
  dependencies: WorkspaceRepositoryRuntimeDependencies,
  runtimeId: string,
  repositoryId: string,
  authorization = anonymousAuthorization,
  signal?: AbortSignal
) {
  const workspace = workspaces.get(runtimeId);
  if (workspace === undefined)
    throw new WorkspaceRepositoryRuntimeError(
      'unavailable',
      'The workspace runtime is no longer available. Reload it to retry.'
    );
  const repository = workspace.repositories.find(candidate => candidate.id === repositoryId);
  if (repository === undefined)
    throw new WorkspaceRepositoryRuntimeError(
      'invalid',
      'The requested repository is not part of this workspace.'
    );
  if (workspace.statuses.get(repository.id)?.status === 'successful')
    throw new WorkspaceRepositoryRuntimeError('stale', 'Only failed repositories can be retried.');
  return runWorkspaceOperationAsync(
    workspace,
    operationSignal =>
      loadWorkspaceRepositoriesAsync(
        workspace,
        [repository],
        runtimeId,
        cache,
        dependencies,
        authorization,
        operationSignal
      ),
    signal
  );
}

/*** Create the ephemeral non-secret state retained for one workspace runtime. */
function runtimeWorkspace(input: WorkspaceRepositoryRuntimeInput): WorkspaceRuntimeState {
  return {
    active: false,
    abortController: undefined,
    entries: new Map(),
    generation: 0,
    repositories: input.repositories,
    source: input.source,
    statuses: new Map(),
  };
}

/*** Resolve request authorization without retaining a credential in the runtime workspace. */
function workspaceRepositoryAuthorization(
  input: WorkspaceRepositoryRuntimeInput
): WorkspaceRepositoryAuthorization {
  return {
    authentication: input.authentication ?? 'anonymous',
    authorizationScope: input.authorizationScope ?? 'anonymous',
  };
}

/*** Analyze only the requested repositories, then recompose the whole workspace from retained snapshots. */
export async function loadWorkspaceRepositoriesAsync(
  workspace: WorkspaceRuntimeState,
  repositories: readonly GitHubRepositoryDiscoveryRepository[],
  runtimeId: string,
  cache: WorkspaceAnalysisCache<RepositoryAnalysis>,
  dependencies: WorkspaceRepositoryRuntimeDependencies,
  authorization: WorkspaceRepositoryAuthorization,
  signal?: AbortSignal,
  onProgress?: WorkspaceRepositoryProgress
): Promise<WorkspaceRepositoryRuntimeResult> {
  return loadWorkspaceRepositoryBatchAsync(
    workspace,
    repositories,
    runtimeId,
    async (repository, operationSignal) =>
      analyzeWorkspaceRepositoryAsync(
        repository,
        authorization.authentication,
        authorization.authorizationScope,
        cache,
        dependencies,
        operationSignal
      ),
    signal,
    onProgress
  );
}

/*** Reject overlapping retry work before it can duplicate materialization or produce stale responses. */
export async function runWorkspaceOperationAsync<Result>(
  workspace: WorkspaceRuntimeState,
  operation: (signal: AbortSignal) => Promise<Result>,
  signal?: AbortSignal,
  supersede = false
): Promise<Result> {
  if (workspace.active && !supersede) {
    throw new WorkspaceRepositoryRuntimeError(
      'rate-limited',
      'A workspace operation is already in progress. Try again shortly.'
    );
  }
  workspace.abortController?.abort(
    new DOMException('A newer workspace operation superseded this one.', 'AbortError')
  );
  const controller = new AbortController();
  const operationSignal =
    signal === undefined ? controller.signal : AbortSignal.any([signal, controller.signal]);
  workspace.active = true;
  workspace.abortController = controller;
  try {
    return await operation(operationSignal);
  } finally {
    if (workspace.abortController === controller) {
      workspace.active = false;
      workspace.abortController = undefined;
    }
  }
}

/*** Bound process-local workspace state without evicting a workspace that is currently materializing. */
function retainWorkspace(
  workspaces: Map<string, WorkspaceRuntimeState>,
  runtimeId: string,
  workspace: WorkspaceRuntimeState
): void {
  workspaces.set(runtimeId, workspace);
  while (workspaces.size > MAXIMUM_RUNTIME_WORKSPACES) {
    const oldest = [...workspaces.entries()].find(
      ([candidateId, candidate]) => candidateId !== runtimeId && !candidate.active
    );
    if (oldest === undefined) return;
    workspaces.delete(oldest[0]);
  }
}

export interface WorkspaceRepositoryRuntime {
  readonly loadAsync: (
    input: WorkspaceRepositoryRuntimeInput,
    signal?: AbortSignal
  ) => Promise<WorkspaceRepositoryRuntimeResult>;
  readonly retryAsync: (
    runtimeId: string,
    repositoryId: string,
    authorization?: WorkspaceRepositoryAuthorization,
    signal?: AbortSignal
  ) => Promise<WorkspaceRepositoryRuntimeResult>;
  /*** Apply the #357 selection diff to this request-local runtime. */
  readonly updateAsync: (
    runtimeId: string,
    input: WorkspaceRepositoryRuntimeUpdate,
    authorization?: WorkspaceRepositoryAuthorization,
    signal?: AbortSignal
  ) => Promise<WorkspaceRepositoryRuntimeResult>;
}

export interface WorkspaceRepositoryRuntimeDependencies {
  readonly cache?: WorkspaceAnalysisCache<RepositoryAnalysis>;
  readonly inspectAsync?: (path: string) => Promise<ProjectInspection>;
  readonly materializeAsync?: (
    source: ProjectSource,
    signal?: AbortSignal,
    authentication?: GitHubRepositoryAuthentication
  ) => Promise<ResolvedProjectSource>;
  readonly resolveRevisionAsync: (
    url: string,
    authentication: GitHubRepositoryAuthentication,
    signal?: AbortSignal
  ) => Promise<{
    readonly repository: { readonly id: string };
    readonly revision: { readonly commitSha: string };
  }>;
}

export interface WorkspaceRepositoryRuntimeInput {
  readonly authentication?: GitHubRepositoryAuthentication;
  readonly authorizationScope?: string;
  readonly repositories: readonly GitHubRepositoryDiscoveryRepository[];
  /*** Receive credential-free snapshots as individual repositories complete, in completion order. */
  readonly onProgress?: WorkspaceRepositoryProgress;
  readonly source: string;
}

export interface WorkspaceRepositoryAuthorization {
  readonly authentication: GitHubRepositoryAuthentication;
  readonly authorizationScope: string;
}

/*** Trusted selection changes supplied by the navigation owner; repository records remain server-validated. */
export interface WorkspaceRepositoryRuntimeUpdate {
  readonly addedRepositories: readonly GitHubRepositoryDiscoveryRepository[];
  readonly removedRepositoryIds: readonly string[];
  readonly onProgress?: WorkspaceRepositoryProgress;
}

const anonymousAuthorization: WorkspaceRepositoryAuthorization = {
  authentication: 'anonymous',
  authorizationScope: 'anonymous',
};

/*** Classifies client-safe runtime failures so inbound transport can select the correct HTTP status. */
export class WorkspaceRepositoryRuntimeError extends Error {
  public constructor(
    readonly kind: 'invalid' | 'rate-limited' | 'stale' | 'unavailable',
    message: string
  ) {
    super(message);
  }
}

const MAXIMUM_RUNTIME_WORKSPACES = 32;
