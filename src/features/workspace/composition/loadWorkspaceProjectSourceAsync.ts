import type { DependencyGraph } from '@ankhorage/dependency-graph';
import type { ProjectInspection } from '@ankhorage/project-detector/types';
import { toErrorMessage } from '@ankhorage/utility/error';
import { normalizeGitHubRepositoryUrl } from '@ankhorage/utility/url';

import { parseProjectSource } from '@/features/project-source/application/use-cases/parseProjectSource';
import {
  discoverWorkspaceGitHubSourcesAsync,
  isGitHubRepositorySource,
} from '@/features/project-source/composition/discoverWorkspaceGitHubSourcesAsync';
import { loadProjectSourceAsync } from '@/features/project-source/composition/loadProjectSourceAsync';
import {
  loadMultiProjectWorkspaceAsync,
  type MultiProjectWorkspaceProject,
} from '@/features/workspace/composition/loadMultiProjectWorkspaceAsync';
import { loadWorkspaceAsync } from '@/features/workspace/composition/loadWorkspaceAsync';
import { resolveWorkspaceStartupSource } from '@/features/workspace/composition/resolveWorkspaceStartupSource';
import { settleBoundedAsync } from '@/features/workspace/utils/settleBoundedAsync';
import type { ProjectSource, ResolvedProjectSource } from '@/types/projectSource';
import type { WorkspaceLoadResult } from '@/types/workspace';
import { getProjectName } from '@/utils/getProjectName';
import { parseProjectPath } from '@/utils/parseProjectPath';

export interface WorkspaceProjectSourceResult {
  readonly currentSource?: string;
  readonly repositories?: readonly WorkspaceRepositoryOption[];
  readonly projectName: string;
  readonly workspace: WorkspaceLoadResult;
}

/*** Load the configured local project or one GitHub URL supplied by the browser query. */
export async function loadWorkspaceProjectSourceAsync(
  sourceValue: string | undefined,
  loadDependencyGraphAsync: (inspection: ProjectInspection) => Promise<DependencyGraph>,
  materializeAsync: (
    source: ProjectSource,
    signal?: AbortSignal
  ) => Promise<ResolvedProjectSource> = loadProjectSourceAsync,
  signal?: AbortSignal
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
    if (isGitHubRepositorySource(startupSource.source)) {
      return await loadSingleGitHubWorkspaceAsync(
        startupSource.source,
        loadDependencyGraphAsync,
        materializeAsync,
        signal
      );
    }
    return await loadGitHubWorkspaceAsync(
      startupSource.source,
      loadDependencyGraphAsync,
      materializeAsync,
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

/*** Preserve direct repository opening without an unnecessary GitHub discovery request. */
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

/*** Discover, materialize, and analyze explicitly selected GitHub repositories. */
async function loadGitHubWorkspaceAsync(
  sourceValue: string,
  loadDependencyGraphAsync: (inspection: ProjectInspection) => Promise<DependencyGraph>,
  materializeAsync: (source: ProjectSource, signal?: AbortSignal) => Promise<ResolvedProjectSource>,
  signal?: AbortSignal
): Promise<WorkspaceProjectSourceResult> {
  const { source, excludedRepositoryIds } = parseGitHubWorkspaceSource(sourceValue);
  const discovery = await discoverWorkspaceGitHubSourcesAsync(source, excludedRepositoryIds);
  const materialization = await materializeDiscoveredProjectsAsync(
    discovery.selectedRepositories,
    materializeAsync,
    signal
  );
  const { projects: resolvedProjects } = materialization;
  try {
    if (resolvedProjects.length === 0)
      throw new Error(
        materialization.errors.at(0) ?? 'No selected GitHub repositories could be materialized.'
      );
    return {
      currentSource: sourceValue,
      repositories: discovery.repositories.map(repository => ({
        ...repository,
        selected: discovery.selectedRepositories.some(selected => selected.id === repository.id),
      })),
      projectName:
        resolvedProjects.length === 1
          ? resolvedProjects[0].resolved.projectName
          : 'GitHub workspace',
      workspace: await loadDiscoveredWorkspaceAsync(
        resolvedProjects,
        loadDependencyGraphAsync,
        signal
      ),
    };
  } finally {
    await Promise.all(resolvedProjects.map(project => project.resolved.cleanupAsync()));
  }
}

/*** Materialize only selected repositories after cheap owner discovery has completed. */
async function materializeDiscoveredProjectsAsync(
  repositories: readonly Parameters<
    typeof loadMultiProjectWorkspaceAsync
  >[0][number]['repository'][],
  materializeAsync: (source: ProjectSource, signal?: AbortSignal) => Promise<ResolvedProjectSource>,
  signal?: AbortSignal
): Promise<MaterializedWorkspaceProjects> {
  const outcomes = await settleBoundedAsync(
    repositories,
    MAX_CONCURRENT_REPOSITORY_MATERIALIZATIONS,
    async (repository, materializationSignal) => ({
      repository,
      resolved: await materializeAsync(
        parseProjectSource(normalizeGitHubRepositoryUrl(repository.url)),
        materializationSignal
      ),
    }),
    signal
  );
  return {
    projects: outcomes
      .filter(
        (outcome): outcome is PromiseFulfilledResult<MultiProjectWorkspaceProject> =>
          outcome.status === 'fulfilled'
      )
      .map(outcome => outcome.value),
    errors: outcomes
      .filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected')
      .map(outcome => toErrorMessage(outcome.reason, 'Unable to materialize GitHub repository.')),
  };
}

/*** Keep the existing single-project loader as the compatibility path for one repository. */
function loadDiscoveredWorkspaceAsync(
  projects: readonly MultiProjectWorkspaceProject[],
  loadDependencyGraphAsync: (inspection: ProjectInspection) => Promise<DependencyGraph>,
  signal?: AbortSignal
): Promise<WorkspaceLoadResult> {
  return projects.length === 1
    ? loadWorkspaceAsync(projects[0].resolved.rootPath, loadDependencyGraphAsync)
    : loadMultiProjectWorkspaceAsync(projects, signal);
}

/*** Decode persisted exclusion identities without changing the established source query format. */
function parseGitHubWorkspaceSource(value: string): {
  readonly source: string;
  readonly excludedRepositoryIds: ReadonlySet<string>;
} {
  const [source, exclusions = ''] = value.split('|exclude=');
  return {
    source,
    excludedRepositoryIds: new Set(
      exclusions
        .split(',')
        .map(id => id.trim())
        .filter(Boolean)
    ),
  };
}

export interface WorkspaceRepositoryOption {
  readonly id: string;
  readonly name: string;
  readonly owner: string;
  readonly selected: boolean;
  readonly url: string;
}

interface MaterializedWorkspaceProjects {
  readonly projects: readonly MultiProjectWorkspaceProject[];
  readonly errors: readonly string[];
}

const MAX_CONCURRENT_REPOSITORY_MATERIALIZATIONS = 4;
