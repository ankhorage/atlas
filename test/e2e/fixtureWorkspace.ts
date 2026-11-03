import { resolve } from 'node:path';

import type { DependencyGraph } from '@ankhorage/dependency-graph';
import type { ProjectInspection } from '@ankhorage/project-detector/types';

import { loadWorkspaceProjectSourceAsync } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';
import type { ProjectSource, ResolvedProjectSource } from '@/types/projectSource';

const fixtureRoot = resolve(process.cwd(), '../../fixtures/workspace-multi');

const repositories = [
  repository('owner-a-catalog', 'owner-a', 'catalog'),
  repository('owner-a-shared', 'owner-a', 'shared'),
  repository('owner-b-workspace', 'owner-b', 'workspace'),
  repository('owner-b-disconnected', 'owner-b', 'disconnected'),
  repository('owner-b-failed', 'owner-b', 'failed'),
] as const;

/*** Loads fixture repositories through the production discovery and multi-project analysis pipeline. */
export function loadFixtureWorkspaceAsync(source: string | undefined) {
  return loadWorkspaceProjectSourceAsync(
    source,
    emptyDependencyGraphAsync,
    materializeFixtureAsync,
    discoverFixtureAsync
  );
}

/*** Keep the test fixture focused on manifest dependencies rather than source import scanning. */
function emptyDependencyGraphAsync(_inspection: ProjectInspection): Promise<DependencyGraph> {
  return Promise.resolve({ edges: [], nodes: [] });
}

/*** Resolves synthetic public GitHub URLs to test-owned fixture directories without network access. */
function materializeFixtureAsync(source: ProjectSource): Promise<ResolvedProjectSource> {
  if (source.kind !== 'github')
    return Promise.reject(new Error('Fixture requires GitHub repository sources.'));
  const repository = repositories.find(item => item.url === source.url);
  if (repository === undefined || repository.id === 'owner-b-failed')
    return Promise.reject(new Error('Fixture materialization failed.'));
  return Promise.resolve({
    cleanupAsync: () => Promise.resolve(),
    projectName: repository.name,
    rootPath: resolve(fixtureRoot, repository.owner, repository.name),
    source,
  });
}

/*** Provides overlapping owner discovery with stable repository identities for browser acceptance only. */
function discoverFixtureAsync(ownerSource: string, excluded: ReadonlySet<string>) {
  const owners = ownerSource
    .split(',')
    .map(owner => owner.trim().replace(/^@/u, ''))
    .filter(Boolean);
  const discovered = deduplicateRepositories(
    owners.flatMap(owner =>
      repositories.filter(
        repository =>
          repository.owner === owner || (owner === 'owner-b' && repository.id === 'owner-a-shared')
      )
    )
  );
  const selectedRepositories = discovered.filter(repository => !excluded.has(repository.id));
  return Promise.resolve({ repositories: discovered, selectedRepositories });
}

/*** Retains one canonical record when two owners expose the same repository through discovery. */
function deduplicateRepositories<T extends { readonly id: string }>(
  repositories: readonly T[]
): readonly T[] {
  return [...new Map(repositories.map(repository => [repository.id, repository])).values()];
}

/*** Creates one credential-free repository record that matches the public GitHub discovery contract. */
function repository(id: string, owner: string, name: string) {
  return {
    id,
    name,
    owner,
    url: `https://github.com/${owner}/${name}`,
    visibility: 'public' as const,
  };
}
