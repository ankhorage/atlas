import { randomUUID } from 'node:crypto';

import {
  createProjectAnalysisSnapshotAsync,
  createSourceGraphFromProjectAnalysisSnapshots,
  projectDependencyGraphFromProjectAnalysisSnapshots,
} from '@ankhorage/dependency-graph';
import type { ProjectInspection } from '@ankhorage/project-detector/types';
import type {
  GitHubRepositoryAuthentication,
  GitHubRepositoryDiscoveryRepository,
} from '@ankhorage/repository/github';

import { inspectProjectForAnalysisAsync } from '@/features/project-analysis/adapters/outbound/project-detector/inspectProjectForAnalysisAsync';
import { selectParserLanguage } from '@/features/project-analysis/application/use-cases/selectParserLanguage';
import { createProjectFileTreeAsync } from '@/features/project-analysis/composition/createProjectFileTreeAsync';
import { parseProjectSource } from '@/features/project-source/application/use-cases/parseProjectSource';
import { loadProjectSourceAsync } from '@/features/project-source/composition/loadProjectSourceAsync';
import {
  createWorkspaceAnalysisCache,
  type WorkspaceAnalysisCache,
} from '@/features/workspace/application/use-cases/createWorkspaceAnalysisCache';
import type {
  RepositoryAnalysis,
  WorkspaceRepositoryRuntimeResult,
} from '@/features/workspace/composition/composeWorkspaceRepositoryRuntimeResult';
import type { WorkspaceRuntimeState } from '@/features/workspace/composition/loadWorkspaceRepositoryBatchAsync';
import { loadWorkspaceRepositoryBatchAsync } from '@/features/workspace/composition/loadWorkspaceRepositoryBatchAsync';
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
        authorization,
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
  return runWorkspaceOperationAsync(workspace, () =>
    loadRepositoriesAsync(
      workspace,
      input.repositories,
      runtimeId,
      cache,
      dependencies,
      workspaceRepositoryAuthorization(input),
      signal
    )
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
  return runWorkspaceOperationAsync(workspace, () =>
    loadRepositoriesAsync(
      workspace,
      [repository],
      runtimeId,
      cache,
      dependencies,
      authorization,
      signal
    )
  );
}

/*** Create the ephemeral non-secret state retained for one workspace runtime. */
function runtimeWorkspace(input: WorkspaceRepositoryRuntimeInput): WorkspaceRuntimeState {
  return {
    active: false,
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
async function loadRepositoriesAsync(
  workspace: WorkspaceRuntimeState,
  repositories: readonly GitHubRepositoryDiscoveryRepository[],
  runtimeId: string,
  cache: WorkspaceAnalysisCache<RepositoryAnalysis>,
  dependencies: WorkspaceRepositoryRuntimeDependencies,
  authorization: WorkspaceRepositoryAuthorization,
  signal?: AbortSignal
): Promise<WorkspaceRepositoryRuntimeResult> {
  return loadWorkspaceRepositoryBatchAsync(
    workspace,
    repositories,
    runtimeId,
    async (repository, operationSignal) =>
      analyzeRepositoryAsync(
        repository,
        authorization.authentication,
        authorization.authorizationScope,
        cache,
        dependencies,
        operationSignal
      ),
    signal
  );
}

/*** Resolve one immutable revision and materialize it only when its validated portable snapshot is absent. */
async function analyzeRepositoryAsync(
  repository: GitHubRepositoryDiscoveryRepository,
  authentication: GitHubRepositoryAuthentication,
  authorizationScope: string,
  cache: WorkspaceAnalysisCache<RepositoryAnalysis>,
  dependencies: WorkspaceRepositoryRuntimeDependencies,
  signal?: AbortSignal
): Promise<RepositoryAnalysis> {
  const revision = await dependencies.resolveRevisionAsync(repository.url, authentication, signal);
  const key = workspaceAnalysisCacheKey(revision, authorizationScope);
  const cached = cache.getAnalysis(key);
  if (cached !== undefined) return cached;
  const source = parseProjectSource(repository.url);
  if (source.kind !== 'github') throw new Error('Workspace repositories must be GitHub sources.');
  const resolved = await (dependencies.materializeAsync ?? loadProjectSourceAsync)(
    { ...source, revision: revision.revision.commitSha },
    signal,
    authentication
  );
  try {
    const inspection = await (dependencies.inspectAsync ?? inspectProjectForAnalysisAsync)(
      resolved.rootPath
    );
    const analysis = await createProjectAnalysisSnapshotAsync({ id: repository.id, inspection });
    const sourceGraph = createSourceGraphFromProjectAnalysisSnapshots([analysis]);
    const dependencyGraph = projectDependencyGraphFromProjectAnalysisSnapshots(sourceGraph, [
      analysis,
    ]);
    const language = selectParserLanguage(inspection.detection);
    const value = {
      analysis,
      files: await createProjectFileTreeAsync(
        inspection,
        dependencyGraph,
        language.language,
        resolved.rootPath
      ),
      language,
    };
    cache.setAnalysis(key, value);
    return value;
  } finally {
    await resolved.cleanupAsync();
  }
}

/*** Scope immutable analyses to the GitHub identity that was authorized to read them. */
function workspaceAnalysisCacheKey(
  revision: Awaited<ReturnType<WorkspaceRepositoryRuntimeDependencies['resolveRevisionAsync']>>,
  authorization: string
) {
  return {
    authorization,
    provider: 'github' as const,
    repositoryId: revision.repository.id,
    revision: revision.revision.commitSha,
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
  };
}

/*** Reject overlapping retry work before it can duplicate materialization or produce stale responses. */
async function runWorkspaceOperationAsync<Result>(
  workspace: WorkspaceRuntimeState,
  operation: () => Promise<Result>
): Promise<Result> {
  if (workspace.active) {
    throw new WorkspaceRepositoryRuntimeError(
      'rate-limited',
      'A workspace operation is already in progress. Try again shortly.'
    );
  }
  workspace.active = true;
  try {
    return await operation();
  } finally {
    workspace.active = false;
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

interface WorkspaceRepositoryRuntimeInput {
  readonly authentication?: GitHubRepositoryAuthentication;
  readonly authorizationScope?: string;
  readonly repositories: readonly GitHubRepositoryDiscoveryRepository[];
  readonly source: string;
}

export interface WorkspaceRepositoryAuthorization {
  readonly authentication: GitHubRepositoryAuthentication;
  readonly authorizationScope: string;
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

const ANALYSIS_SCHEMA_VERSION = 1;
const MAXIMUM_RUNTIME_WORKSPACES = 32;
