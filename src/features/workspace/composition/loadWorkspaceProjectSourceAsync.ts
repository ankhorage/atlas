import type { DependencyGraph } from '@ankhorage/dependency-graph';
import type { ProjectInspection } from '@ankhorage/project-detector/types';
import {
  type GitHubRepositoryAuthentication,
  type GitHubRepositoryRevisionResolutionResult,
  type GitHubRepositoryVisibility,
  resolveGitHubRepositoryRevisionAsync,
} from '@ankhorage/repository/github';
import { toErrorMessage } from '@ankhorage/utility/error';

import type { GitHubRepositoryAuthorization } from '@/features/github-auth/adapters/inbound/next/readGitHubAuthViewAsync';
import { createGitHubProjectMaterializer } from '@/features/project-source/adapters/outbound/repository/createGitHubProjectMaterializer';
import { discoverWorkspaceGitHubSourcesAsync } from '@/features/project-source/composition/discoverWorkspaceGitHubSourcesAsync';
import { loadProjectSourceAsync } from '@/features/project-source/composition/loadProjectSourceAsync';
import {
  createWorkspaceRepositoryRuntime,
  type WorkspaceRepositoryAuthorization,
  type WorkspaceRepositoryRuntime,
} from '@/features/workspace/composition/createWorkspaceRepositoryRuntime';
import { loadWorkspaceAsync } from '@/features/workspace/composition/loadWorkspaceAsync';
import { resolveWorkspaceStartupSource } from '@/features/workspace/composition/resolveWorkspaceStartupSource';
import type { ProjectSource, ResolvedProjectSource } from '@/types/projectSource';
import type { WorkspaceLoadResult } from '@/types/workspace';
import type { WorkspaceRepositoryLoadStatus } from '@/types/workspace';
import { getProjectName } from '@/utils/getProjectName';
import { parseProjectPath } from '@/utils/parseProjectPath';

export interface WorkspaceProjectSourceResult {
  readonly currentSource?: string;
  readonly repositoryStatuses?: readonly WorkspaceRepositoryLoadStatus[];
  readonly repositories?: readonly WorkspaceRepositoryOption[];
  readonly runtimeId?: string;
  readonly selectionRequired?: boolean;
  readonly projectName: string;
  readonly workspace: WorkspaceLoadResult;
}

/*** Retry one failed repository through the process-local runtime that owns its retained snapshots. */
export function retryWorkspaceRepositoryAsync(
  runtimeId: string,
  repositoryId: string,
  authorization: WorkspaceRepositoryAuthorization,
  signal?: AbortSignal
) {
  return defaultWorkspaceRepositoryRuntime.retryAsync(
    runtimeId,
    repositoryId,
    authorization,
    signal
  );
}

/*** Load the configured local project or discover GitHub sources supplied by the browser query. */
export async function loadWorkspaceProjectSourceAsync(
  sourceValue: string | undefined,
  loadDependencyGraphAsync: (inspection: ProjectInspection) => Promise<DependencyGraph>,
  materializeAsync: (
    source: ProjectSource,
    signal?: AbortSignal
  ) => Promise<ResolvedProjectSource> = loadProjectSourceAsync,
  discoverAsync: typeof discoverWorkspaceGitHubSourcesAsync = discoverWorkspaceGitHubSourcesAsync,
  signal?: AbortSignal,
  resolveRevisionAsync: GitHubRevisionResolver = resolveGitHubRevisionAsync,
  runtime?: WorkspaceRepositoryRuntime,
  authentication: GitHubRepositoryAuthentication = 'anonymous',
  authorizationScope = 'anonymous'
): Promise<WorkspaceProjectSourceResult> {
  const startupSource = resolveWorkspaceStartupSource(sourceValue, process.env.ATLAS_PROJECT_PATH);

  if (startupSource.kind === 'filesystem') {
    const projectPath = parseProjectPath(startupSource.path);
    return {
      projectName: getProjectName(projectPath),
      workspace: await loadWorkspaceAsync(projectPath, loadDependencyGraphAsync),
    };
  }

  try {
    return await loadGitHubWorkspaceAsync(
      startupSource.source,
      loadDependencyGraphAsync,
      materializeAsync,
      discoverAsync,
      resolveRevisionAsync,
      runtime,
      signal,
      authentication,
      authorizationScope
    );
  } catch (error) {
    return {
      currentSource: startupSource.source,
      projectName: '{unknown}',
      workspace: {
        ok: false,
        error: toErrorMessage(error, 'Unable to load GitHub repository.'),
      },
    };
  }
}

/*** Delegate multi-project loading to the server-owned revision runtime. */
async function loadGitHubWorkspaceAsync(
  sourceValue: string,
  _loadDependencyGraphAsync: (inspection: ProjectInspection) => Promise<DependencyGraph>,
  materializeAsync: (source: ProjectSource, signal?: AbortSignal) => Promise<ResolvedProjectSource>,
  discoverAsync: typeof discoverWorkspaceGitHubSourcesAsync,
  resolveRevisionAsync: GitHubRevisionResolver,
  runtime: WorkspaceRepositoryRuntime | undefined,
  signal?: AbortSignal,
  authentication: GitHubRepositoryAuthentication = 'anonymous',
  authorizationScope = 'anonymous'
): Promise<WorkspaceProjectSourceResult> {
  const { excludedRepositoryIds, selectedRepositoryIds, source } =
    parseGitHubWorkspaceSource(sourceValue);
  const discovery = await discoverAsync(
    source,
    excludedRepositoryIds,
    selectedRepositoryIds,
    authentication
  );
  const repositories = toRepositoryOptions(discovery);
  if (discovery.selectedRepositories.length === 0)
    return {
      currentSource: source,
      projectName: 'Choose GitHub repositories',
      repositories,
      selectionRequired: true,
      workspace: { ok: false, error: 'Choose one or more repositories, then select Open.' },
    };
  const workspaceRuntime =
    runtime ??
    (materializeAsync === loadProjectSourceAsync &&
    discoverAsync === discoverWorkspaceGitHubSourcesAsync &&
    resolveRevisionAsync === resolveGitHubRevisionAsync
      ? defaultWorkspaceRepositoryRuntime
      : createWorkspaceRepositoryRuntime({ materializeAsync, resolveRevisionAsync }));
  const result = await workspaceRuntime.loadAsync(
    {
      authentication,
      authorizationScope,
      repositories: discovery.selectedRepositories,
      source: sourceValue,
    },
    signal
  );
  return { ...result, repositories };
}

/*** Load a workspace with the credential resolved at the trusted request boundary. */
export function loadAuthenticatedWorkspaceProjectSourceAsync(
  source: string | undefined,
  loadDependencyGraphAsync: (inspection: ProjectInspection) => Promise<DependencyGraph>,
  authorization: GitHubRepositoryAuthorization
): Promise<WorkspaceProjectSourceResult> {
  return loadWorkspaceProjectSourceAsync(
    source,
    loadDependencyGraphAsync,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    authorization.authentication,
    authorization.cacheScope
  );
}

/*** Preserve picker state from discovery while keeping the runtime status model separate. */
function toRepositoryOptions(
  discovery: Awaited<ReturnType<typeof discoverWorkspaceGitHubSourcesAsync>>
): readonly WorkspaceRepositoryOption[] {
  return discovery.repositories.map(repository => ({
    ...repository,
    selected: discovery.selectedRepositories.some(selected => selected.id === repository.id),
  }));
}

/*** Decode persisted exclusion identities without changing the established source query format. */
function parseGitHubWorkspaceSource(value: string): {
  readonly source: string;
  readonly excludedRepositoryIds: ReadonlySet<string>;
  readonly selectedRepositoryIds?: ReadonlySet<string> | 'all';
} {
  const [source, selection = ''] = value.split('|');
  const [kind, repositoryIds = ''] = selection.split('=');
  const ids = new Set(
    repositoryIds
      .split(',')
      .map(id => id.trim())
      .filter(Boolean)
  );
  return {
    source,
    excludedRepositoryIds: kind === 'exclude' ? ids : new Set(),
    ...(kind === 'include' ? { selectedRepositoryIds: ids } : {}),
    ...(kind === 'exclude' ? { selectedRepositoryIds: 'all' as const } : {}),
  };
}

export interface WorkspaceRepositoryOption {
  readonly id: string;
  readonly name: string;
  readonly owner: string;
  readonly selected: boolean;
  readonly url: string;
  readonly visibility: GitHubRepositoryVisibility;
}

type GitHubRevisionResolver = (
  url: string,
  authentication: GitHubRepositoryAuthentication,
  signal?: AbortSignal
) => Promise<GitHubRepositoryRevisionResolutionResult>;

/*** Resolve a GitHub URL to its immutable revision through the public Repository capability. */
function resolveGitHubRevisionAsync(
  url: string,
  authentication: GitHubRepositoryAuthentication,
  signal?: AbortSignal
): Promise<GitHubRepositoryRevisionResolutionResult> {
  return resolveGitHubRepositoryRevisionAsync({ authentication, url, signal });
}

/*** Keep the default cache process-local; another server instance transparently starts a fresh runtime. */
const defaultWorkspaceRepositoryRuntime = createWorkspaceRepositoryRuntime({
  materializeAsync: async (source, signal, authentication = 'anonymous') => {
    if (source.kind !== 'github') return loadProjectSourceAsync(source, signal);
    const materialized = await createGitHubProjectMaterializer().materializeAsync(
      source,
      signal,
      authentication
    );
    return { ...materialized, source };
  },
  resolveRevisionAsync: resolveGitHubRevisionAsync,
});
