import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import type { DependencyGraph } from '@ankhorage/dependency-graph';
import type { GitHubRepositoryRevisionResolutionResult } from '@ankhorage/repository/github';
import type { ProjectInspection } from '@ankhorage/project-detector/types';

import {
  createWorkspaceRepositoryRuntime,
  WorkspaceRepositoryRuntimeError,
  type WorkspaceRepositoryRuntime,
} from '@/features/workspace/composition/createWorkspaceRepositoryRuntime';
import { loadWorkspaceProjectSourceAsync } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';
import type { ProjectSource, ResolvedProjectSource } from '@/types/projectSource';

const fixtureRoot = process.env.ATLAS_FIXTURE_ROOT ?? resolveFixtureRoot();

const repositories = [
  repository('owner-a-catalog', 'owner-a', 'catalog'),
  repository('owner-a-shared', 'owner-a', 'shared'),
  repository('owner-b-workspace', 'owner-b', 'workspace'),
  repository('owner-b-disconnected', 'owner-b', 'disconnected'),
  repository('owner-b-failed', 'owner-b', 'failed'),
] as const;
const viewportRepositories = [5, 20, 87].flatMap(count =>
  Array.from({ length: count }, (_, index) =>
    repository(`viewport-${count}-${index}`, 'viewport', `repository-${index}`)
  )
);
const viewportFixtureRoot = resolve(tmpdir(), `atlas-workspace-viewport-${process.pid}`);
const fixtureRuntimeRegistryKey = '__atlasFixtureWorkspaceRuntime__';

/*** Loads fixture repositories through the production discovery and multi-project analysis pipeline. */
export function loadFixtureWorkspaceAsync(source: string | undefined) {
  const runtime = createFixtureRuntime();
  fixtureRuntimeRegistry().runtime = runtime;
  return loadWorkspaceProjectSourceAsync(
    source,
    emptyDependencyGraphAsync,
    materializeFixtureAsync,
    discoverFixtureAsync,
    undefined,
    resolveFixtureRevisionAsync,
    runtime
  );
}

/*** Retries against the runtime composed for the current fixture page request only. */
export function retryFixtureWorkspaceRepositoryAsync(runtimeId: string, repositoryId: string) {
  const runtime = fixtureRuntimeRegistry().runtime;
  if (runtime === undefined)
    throw new WorkspaceRepositoryRuntimeError(
      'unavailable',
      'The fixture workspace runtime is no longer available. Reload it to retry.'
    );
  return runtime.retryAsync(runtimeId, repositoryId);
}

/*** Keep the test fixture focused on manifest dependencies rather than source import scanning. */
function emptyDependencyGraphAsync(_inspection: ProjectInspection): Promise<DependencyGraph> {
  return Promise.resolve({ edges: [], nodes: [] });
}

/*** Resolves synthetic public GitHub URLs to test-owned fixture directories without network access. */
function materializeFixtureAsync(source: ProjectSource): Promise<ResolvedProjectSource> {
  return createFixtureMaterializer()(source);
}

/*** Own one isolated runtime per initial fixture request so scenarios cannot retain stale failures. */
function createFixtureRuntime(): WorkspaceRepositoryRuntime {
  return createWorkspaceRepositoryRuntime({
    materializeAsync: createFixtureMaterializer(),
    resolveRevisionAsync: resolveFixtureRevisionAsync,
  });
}

/*** Materialize exact synthetic revisions while making repository D recover on its targeted retry. */
function createFixtureMaterializer() {
  const attempts = new Map<string, number>();
  return async (source: ProjectSource): Promise<ResolvedProjectSource> => {
    if (source.kind !== 'github') throw new Error('Fixture requires GitHub repository sources.');
    const repository = allRepositories().find(item => item.url === source.url);
    if (repository === undefined) throw new Error('Unknown fixture repository.');
    const attempt = (attempts.get(repository.id) ?? 0) + 1;
    attempts.set(repository.id, attempt);
    if (repository.id === 'owner-b-failed' && attempt === 1)
      throw new Error('Fixture materialization failed.');
    if (repository.id.startsWith('viewport-'))
      return materializeViewportFixtureAsync(repository, source);
    return {
      cleanupAsync: () => Promise.resolve(),
      projectName: repository.name,
      rootPath: fixturePath(repository),
      source,
    };
  };
}

/*** Materializes a uniquely named temporary package so viewport repositories cannot collide. */
async function materializeViewportFixtureAsync(
  repository: { readonly id: string; readonly name: string },
  source: ProjectSource
): Promise<ResolvedProjectSource> {
  const rootPath = resolve(viewportFixtureRoot, repository.id);
  await mkdir(resolve(rootPath, 'src'), { recursive: true });
  await Promise.all([
    writeFile(
      resolve(rootPath, 'package.json'),
      JSON.stringify({ name: `@fixture/${repository.id}`, version: '1.0.0' })
    ),
    writeFile(
      resolve(rootPath, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'bundler' },
        include: ['src'],
      })
    ),
    writeFile(resolve(rootPath, 'src/index.ts'), 'export {};\n'),
  ]);
  return {
    cleanupAsync: () => rm(rootPath, { force: true, recursive: true }),
    projectName: repository.name,
    rootPath,
    source,
  };
}

/*** Resolve only canonical synthetic identities to stable immutable revisions without GitHub access. */
function resolveFixtureRevisionAsync(
  url: string
): Promise<GitHubRepositoryRevisionResolutionResult> {
  const repository = allRepositories().find(item => item.url === url);
  if (repository === undefined) return Promise.reject(new Error('Unknown fixture repository.'));
  return Promise.resolve({
    repository: {
      defaultBranch: 'main',
      id: repository.id,
      name: repository.name,
      owner: repository.owner,
      url: repository.url,
    },
    revision: { commitSha: fixtureCommitSha(repository.id), ref: 'main' },
  });
}

/*** Provide valid SHA-shaped immutable fixture revisions without coupling tests to provider state. */
function fixtureCommitSha(repositoryId: string): string {
  return repositoryId
    .replaceAll(/[^a-f0-9]/giu, '')
    .padEnd(40, '0')
    .slice(0, 40);
}

/*** Keep fixture runtime ownership process-scoped across independent Next.js server bundles. */
function fixtureRuntimeRegistry(): { runtime?: WorkspaceRepositoryRuntime } {
  const target = globalThis as typeof globalThis & {
    [fixtureRuntimeRegistryKey]?: { runtime?: WorkspaceRepositoryRuntime };
  };
  target[fixtureRuntimeRegistryKey] ??= {};
  return target[fixtureRuntimeRegistryKey];
}

/*** Locate test-owned fixture data from either the isolated app or repository server process. */
function resolveFixtureRoot(): string {
  const candidates = [
    resolve(process.cwd(), '../../fixtures/workspace-multi'),
    resolve(process.cwd(), 'test/fixtures/workspace-multi'),
    ...(process.env.PWD === undefined
      ? []
      : [resolve(process.env.PWD, 'test/fixtures/workspace-multi')]),
    ...(process.env.INIT_CWD === undefined
      ? []
      : [resolve(process.env.INIT_CWD, 'test/fixtures/workspace-multi')]),
  ];
  const root = candidates.find(existsSync);
  if (root === undefined) throw new Error('Workspace fixture root is unavailable.');
  return root;
}

/*** Provides overlapping owner discovery with stable repository identities for browser acceptance only. */
function discoverFixtureAsync(
  ownerSource: string,
  excluded: ReadonlySet<string>,
  selected?: ReadonlySet<string> | 'all'
) {
  const viewportSelection = viewportFixtureRepositories(ownerSource);
  const availableRepositories = viewportSelection ?? repositories;
  const directRepository = availableRepositories.find(
    repository =>
      repository.url === ownerSource || `${repository.owner}/${repository.name}` === ownerSource
  );
  const owners = ownerSource
    .split(',')
    .map(owner => owner.trim().replace(/^@/u, ''))
    .filter(Boolean);
  const discovered = deduplicateRepositories(
    owners.flatMap(owner =>
      availableRepositories.filter(
        repository =>
          repository.owner === owner || (owner === 'owner-b' && repository.id === 'owner-a-shared')
      )
    )
  );
  const discoveredRepositories =
    viewportSelection ?? (directRepository === undefined ? discovered : [directRepository]);
  const selectedRepositories = discoveredRepositories.filter(
    repository =>
      !excluded.has(repository.id) &&
      (selected === 'all' ||
        (selected !== undefined && selected.has(repository.id)) ||
        repository.id === directRepository?.id)
  );
  return Promise.resolve({
    repositories: discoveredRepositories,
    selectedRepositories,
  });
}

/*** Returns one deterministic selected-repository scale only for viewport acceptance. */
function viewportFixtureRepositories(source: string) {
  const match = /^viewport-(5|20|87)$/u.exec(source.trim());
  return match === null
    ? undefined
    : viewportRepositories.filter(repository => repository.id.startsWith(`viewport-${match[1]}-`));
}

/*** Reuses a real package fixture while each repository retains its canonical identity. */
function fixturePath(repository: { readonly owner: string; readonly name: string }): string {
  const path = resolve(fixtureRoot, repository.owner, repository.name);
  return existsSync(path) ? path : resolve(fixtureRoot, 'owner-a', 'catalog');
}

/*** Makes test-only scale records materializable without exposing them to ordinary fixture owners. */
function allRepositories() {
  return [...repositories, ...viewportRepositories];
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
