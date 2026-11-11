import type { DependencyGraph } from '@ankhorage/dependency-graph';
import type { ProjectInspection } from '@ankhorage/project-detector/types';
import {
  type GitHubRepositoryRevisionResolutionResult,
  resolveGitHubRepositoryRevisionAsync,
} from '@ankhorage/repository/github';
import { toErrorMessage } from '@ankhorage/utility/error';
import { normalizeGitHubRepositoryUrl } from '@ankhorage/utility/url';

import { parseProjectSource } from '@/features/project-source/application/use-cases/parseProjectSource';
import {
  discoverWorkspaceGitHubSourcesAsync,
  isGitHubRepositorySource,
} from '@/features/project-source/composition/discoverWorkspaceGitHubSourcesAsync';
import { loadProjectSourceAsync } from '@/features/project-source/composition/loadProjectSourceAsync';
import {
  createWorkspaceRepositoryRuntime,
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
  signal?: AbortSignal
) {
  return defaultWorkspaceRepositoryRuntime.retryAsync(runtimeId, repositoryId, signal);
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
  runtime?: WorkspaceRepositoryRuntime
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
    if (isShorthandGitHubRepositorySource(startupSource.source))
      return await loadSingleGitHubWorkspaceAsync(
        startupSource.source,
        loadDependencyGraphAsync,
        materializeAsync,
        signal
      );
    return await loadGitHubWorkspaceAsync(
      startupSource.source,
      loadDependencyGraphAsync,
      materializeAsync,
      discoverAsync,
      resolveRevisionAsync,
      runtime,
      signal
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

/*** Preserve shorthand repository loading while full URLs retain the owner picker selection. */
async function loadSingleGitHubWorkspaceAsync(
  sourceValue: string,
  loadDependencyGraphAsync: (inspection: ProjectInspection) => Promise<DependencyGraph>,
  materializeAsync: (source: ProjectSource, signal?: AbortSignal) => Promise<ResolvedProjectSource>,
  signal?: AbortSignal
): Promise<WorkspaceProjectSourceResult> {
  const source = parseProjectSource(normalizeGitHubRepositoryUrl(sourceValue));
  if (source.kind !== 'github')
    throw new Error('The browser source field accepts GitHub repository URLs only.');
  const resolved = await materializeAsync(source, signal);
  try {
    return {
      currentSource: source.url,
      projectName: resolved.projectName,
      workspace: await loadWorkspaceAsync(resolved.rootPath, loadDependencyGraphAsync),
    };
  } finally {
    await resolved.cleanupAsync();
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
  signal?: AbortSignal
): Promise<WorkspaceProjectSourceResult> {
  const { excludedRepositoryIds, selectedRepositoryIds, source } =
    parseGitHubWorkspaceSource(sourceValue);
  const discovery = await discoverAsync(source, excludedRepositoryIds, selectedRepositoryIds);
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
    { repositories: discovery.selectedRepositories, source: sourceValue },
    signal
  );
  return { ...result, repositories };
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
}

type GitHubRevisionResolver = (
  url: string,
  signal?: AbortSignal
) => Promise<GitHubRepositoryRevisionResolutionResult>;

/*** Resolve a GitHub URL to its immutable revision through the public Repository capability. */
function resolveGitHubRevisionAsync(
  url: string,
  signal?: AbortSignal
): Promise<GitHubRepositoryRevisionResolutionResult> {
  return resolveGitHubRepositoryRevisionAsync({ url, signal });
}

/*** Distinguish full GitHub URLs, which retain owner discovery state, from shorthand repository sources. */
function isGitHubRepositoryUrl(source: string): boolean {
  try {
    return new URL(source).hostname === 'github.com';
  } catch {
    return false;
  }
}

/*** Preserve direct shorthand behavior while full URLs retain owner discovery state. */
function isShorthandGitHubRepositorySource(source: string): boolean {
  return isGitHubRepositorySource(source) && !isGitHubRepositoryUrl(source);
}

/*** Keep the default cache process-local; another server instance transparently starts a fresh runtime. */
const defaultWorkspaceRepositoryRuntime = createWorkspaceRepositoryRuntime({
  resolveRevisionAsync: resolveGitHubRevisionAsync,
});
