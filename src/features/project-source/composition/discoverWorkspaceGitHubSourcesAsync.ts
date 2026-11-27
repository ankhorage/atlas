import {
  discoverGitHubAuthenticatedUserRepositoriesAsync,
  discoverGitHubRepositoriesAsync,
  type GitHubRepositoryAuthentication,
  type GitHubRepositoryDiscoveryRepository,
} from '@ankhorage/repository/github';

/*** Discover the repositories represented by owner or repository sources without materializing them. */
export async function discoverWorkspaceGitHubSourcesAsync(
  sourceValue: string,
  excludedRepositoryIds: ReadonlySet<string>,
  selectedRepositoryIds?: ReadonlySet<string> | 'all',
  authentication: GitHubRepositoryAuthentication = 'anonymous',
  discoverAuthenticatedInventoryAsync: DiscoverAuthenticatedInventoryAsync = discoverGitHubAuthenticatedUserRepositoriesAsync
): Promise<WorkspaceGitHubDiscovery> {
  const sources = sourceValue
    .split(',')
    .map(source => source.trim())
    .filter(Boolean);
  if (sources.length === 0) throw new Error('At least one GitHub owner or repository is required.');

  const discoveries = await Promise.all(
    sources.map(source =>
      discoverGitHubSourceAsync(source, authentication, discoverAuthenticatedInventoryAsync)
    )
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

/*** Resolve the explicit authenticated inventory token without permitting it to select environment credentials. */
async function discoverGitHubSourceAsync(
  source: string,
  authentication: GitHubRepositoryAuthentication,
  discoverAuthenticatedInventoryAsync: DiscoverAuthenticatedInventoryAsync
): Promise<{
  readonly repositories: readonly GitHubRepositoryDiscoveryRepository[];
  readonly selectedRepository?: GitHubRepositoryDiscoveryRepository;
}> {
  if (typeof authentication === 'object' && isAuthenticatedInventorySource(source)) {
    const inventory = await discoverAuthenticatedInventoryAsync({ authentication });
    return {
      repositories:
        source === '@me'
          ? inventory.repositories
          : inventory.repositories.filter(
              repository => repository.owner.toLowerCase() === source.toLowerCase()
            ),
    };
  }
  if (source !== '@me') return discoverGitHubRepositoriesAsync({ authentication, source });
  throw new Error('Sign in with GitHub to view your accessible repositories.');
}

/*** Restrict authenticated inventory consumption to the owner forms already accepted by Repository. */
function isAuthenticatedInventorySource(source: string): boolean {
  return source === '@me' || (!source.includes('/') && !source.includes(':'));
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

export interface WorkspaceGitHubDiscovery {
  readonly repositories: readonly GitHubRepositoryDiscoveryRepository[];
  readonly selectedRepositories: readonly GitHubRepositoryDiscoveryRepository[];
}

type DiscoverAuthenticatedInventoryAsync = typeof discoverGitHubAuthenticatedUserRepositoriesAsync;
