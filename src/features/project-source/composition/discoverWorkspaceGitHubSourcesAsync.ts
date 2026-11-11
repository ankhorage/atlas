import {
  discoverGitHubRepositoriesAsync,
  type GitHubRepositoryDiscoveryRepository,
} from '@ankhorage/repository/github';
import { normalizeGitHubRepositoryUrl } from '@ankhorage/utility/url';

/*** Discover the repositories represented by owner or repository sources without materializing them. */
export async function discoverWorkspaceGitHubSourcesAsync(
  sourceValue: string,
  excludedRepositoryIds: ReadonlySet<string>,
  selectedRepositoryIds?: ReadonlySet<string> | 'all'
): Promise<WorkspaceGitHubDiscovery> {
  const sources = sourceValue
    .split(',')
    .map(source => source.trim())
    .filter(Boolean);
  if (sources.length === 0) throw new Error('At least one GitHub owner or repository is required.');

  const discoveries = await Promise.all(
    sources.map(source => discoverGitHubRepositoriesAsync({ authentication: 'anonymous', source }))
  );
  const repositories = dedupeRepositories(discoveries.flatMap(discovery => discovery.repositories));
  const selectedIds =
    selectedRepositoryIds === 'all'
      ? new Set(repositories.map(repository => repository.id))
      : (selectedRepositoryIds ?? selectedIdsFromDiscovery(discoveries));
  const knownIds = new Set(repositories.map(repository => repository.id));
  if ([...selectedIds].some(repositoryId => !knownIds.has(repositoryId)))
    throw new Error('The selected GitHub repository is not available from this source.');
  const selectedRepositories = repositories.filter(
    repository => selectedIds.has(repository.id) && !excludedRepositoryIds.has(repository.id)
  );

  return { repositories, selectedRepositories };
}

/*** Preserve direct repository choices while owner discovery waits for an explicit selection. */
function selectedIdsFromDiscovery(
  discoveries: readonly {
    readonly repositories: readonly GitHubRepositoryDiscoveryRepository[];
    readonly selectedRepository?: GitHubRepositoryDiscoveryRepository;
  }[]
): ReadonlySet<string> {
  return new Set(
    discoveries.flatMap(discovery =>
      discovery.selectedRepository === undefined ? [] : [discovery.selectedRepository.id]
    )
  );
}

/*** Keep repository identity stable when several owner sources overlap. */
function dedupeRepositories(
  repositories: readonly GitHubRepositoryDiscoveryRepository[]
): readonly GitHubRepositoryDiscoveryRepository[] {
  return [...new Map(repositories.map(repository => [repository.id, repository])).values()].sort(
    (left, right) => left.owner.localeCompare(right.owner) || left.name.localeCompare(right.name)
  );
}

/*** Distinguish canonical repository URLs from owner inputs accepted by Repository discovery. */
export function isGitHubRepositorySource(source: string): boolean {
  try {
    normalizeGitHubRepositoryUrl(source);
    return true;
  } catch {
    return false;
  }
}

export interface WorkspaceGitHubDiscovery {
  readonly repositories: readonly GitHubRepositoryDiscoveryRepository[];
  readonly selectedRepositories: readonly GitHubRepositoryDiscoveryRepository[];
}
