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
import {
  composeWorkspaceRepositoryRuntimeResult,
  type RepositoryAnalysis,
  type WorkspaceRepositoryRuntimeResult,
} from '@/features/workspace/composition/composeWorkspaceRepositoryRuntimeResult';
import { settleBoundedAsync } from '@/features/workspace/utils/settleBoundedAsync';
import type { ProjectSource, ResolvedProjectSource } from '@/types/projectSource';
import type { WorkspaceRepositoryLoadStatus } from '@/types/workspace';

/*** Own process-local GitHub workspace state and revision-keyed portable analysis snapshots. */
export function createWorkspaceRepositoryRuntime(
  dependencies: WorkspaceRepositoryRuntimeDependencies
): WorkspaceRepositoryRuntime {
  const cache = dependencies.cache ?? createWorkspaceAnalysisCache<RepositoryAnalysis>(32);
  const workspaces = new Map<string, RuntimeWorkspace>();

  return {
    async loadAsync(input, signal) {
      const workspace: RuntimeWorkspace = {
        active: false,
        authentication: input.authentication ?? 'anonymous',
        authorizationScope: input.authorizationScope ?? 'anonymous',
        entries: new Map(),
        generation: 0,
        repositories: input.repositories,
        source: input.source,
        statuses: new Map(),
      };
      const runtimeId = randomUUID();
      retainWorkspace(workspaces, runtimeId, workspace);
      return runWorkspaceOperationAsync(workspace, () =>
        loadRepositoriesAsync(workspace, input.repositories, runtimeId, cache, dependencies, signal)
      );
    },
    async retryAsync(runtimeId, repositoryId, signal) {
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
        throw new WorkspaceRepositoryRuntimeError(
          'stale',
          'Only failed repositories can be retried.'
        );
      return runWorkspaceOperationAsync(workspace, () =>
        loadRepositoriesAsync(workspace, [repository], runtimeId, cache, dependencies, signal)
      );
    },
  };
}

/*** Analyze only the requested repositories, then recompose the whole workspace from retained snapshots. */
async function loadRepositoriesAsync(
  workspace: RuntimeWorkspace,
  repositories: readonly GitHubRepositoryDiscoveryRepository[],
  runtimeId: string,
  cache: WorkspaceAnalysisCache<RepositoryAnalysis>,
  dependencies: WorkspaceRepositoryRuntimeDependencies,
  signal?: AbortSignal
): Promise<WorkspaceRepositoryRuntimeResult> {
  const generation = workspace.generation + 1;
  workspace.generation = generation;
  const outcomes = await settleBoundedAsync(
    repositories,
    MAX_CONCURRENT_REPOSITORY_OPERATIONS,
    async (repository, operationSignal) =>
      analyzeRepositoryAsync(
        repository,
        workspace.authentication,
        workspace.authorizationScope,
        cache,
        dependencies,
        operationSignal
      ),
    signal
  );
  if (workspace.generation !== generation)
    throw new DOMException('A newer workspace operation superseded this one.', 'AbortError');

  for (const [index, outcome] of outcomes.entries()) {
    const repository = repositories.at(index);
    if (repository === undefined) continue;
    if (outcome.status === 'fulfilled') {
      workspace.entries.set(repository.id, outcome.value);
      workspace.statuses.set(repository.id, repositoryStatus(repository, 'successful'));
    } else {
      workspace.statuses.set(
        repository.id,
        repositoryStatus(repository, isCancellation(outcome.reason) ? 'cancelled' : 'failed')
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
  workspace: RuntimeWorkspace,
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
  workspaces: Map<string, RuntimeWorkspace>,
  runtimeId: string,
  workspace: RuntimeWorkspace
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

/*** Recognize deliberate aborts separately from repository failures. */
function isCancellation(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

/*** Keep transient runtime status free from provider errors, credentials, and materialization paths. */
function repositoryStatus(
  repository: GitHubRepositoryDiscoveryRepository,
  status: WorkspaceRepositoryLoadStatus['status']
): WorkspaceRepositoryLoadStatus {
  return {
    repository: { id: repository.id, name: repository.name, owner: repository.owner },
    status,
    ...(status === 'successful'
      ? {}
      : {
          description:
            status === 'cancelled'
              ? 'Loading was cancelled.'
              : 'Repository materialization failed.',
        }),
  };
}

interface RuntimeWorkspace {
  active: boolean;
  readonly authentication: GitHubRepositoryAuthentication;
  readonly authorizationScope: string;
  readonly entries: Map<string, RepositoryAnalysis>;
  generation: number;
  readonly repositories: readonly GitHubRepositoryDiscoveryRepository[];
  readonly source: string;
  readonly statuses: Map<string, WorkspaceRepositoryLoadStatus>;
}

export interface WorkspaceRepositoryRuntime {
  readonly loadAsync: (
    input: WorkspaceRepositoryRuntimeInput,
    signal?: AbortSignal
  ) => Promise<WorkspaceRepositoryRuntimeResult>;
  readonly retryAsync: (
    runtimeId: string,
    repositoryId: string,
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
const MAX_CONCURRENT_REPOSITORY_OPERATIONS = 4;
const MAXIMUM_RUNTIME_WORKSPACES = 32;
