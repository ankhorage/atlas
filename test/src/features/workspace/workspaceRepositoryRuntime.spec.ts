import { resolve } from 'node:path';

import { assert, describe, it } from '@artiphishle/testosterone';

import type { GitHubRepositoryDiscoveryRepository } from '@ankhorage/repository/github';

import {
  createWorkspaceRepositoryRuntime,
  WorkspaceRepositoryRuntimeError,
} from '@/features/workspace/composition/createWorkspaceRepositoryRuntime';

describe('[workspace repository runtime]', () => {
  it('retries only the failed repository and reuses successful portable analyses', async () => {
    const repositories = [
      repository('A', 'owner-a', 'catalog'),
      repository('B', 'owner-a', 'shared'),
      repository('C', 'owner-b', 'workspace'),
      repository('D', 'owner-b', 'disconnected'),
    ];
    const materializations = new Map<string, number>();
    let failD = true;
    const runtime = createWorkspaceRepositoryRuntime({
      materializeAsync: async source => {
        if (source.kind !== 'github') throw new Error('Fixture requires GitHub sources.');
        const repository = repositories.find(candidate => candidate.url === source.url);
        if (repository === undefined) throw new Error('Unknown fixture repository.');
        materializations.set(repository.id, (materializations.get(repository.id) ?? 0) + 1);
        if (repository.id === 'D' && failD) throw new Error('D is unavailable.');
        return {
          cleanupAsync: async () => {},
          projectName: repository.name,
          rootPath: resolve('test/fixtures/workspace-multi', repository.owner, repository.name),
          source,
        };
      },
      resolveRevisionAsync: async url => {
        const repository = repositories.find(candidate => candidate.url === url);
        if (repository === undefined) throw new Error('Unknown fixture repository.');
        return {
          repository: { id: repository.id },
          revision: { commitSha: `${repository.id}-sha` },
        };
      },
    });

    const initial = await runtime.loadAsync({ repositories, source: 'owner-a,owner-b' });
    assert.equal(initial.workspace.ok, true);
    if (!initial.workspace.ok) return;
    assert.equal(JSON.stringify(initial).includes('workspace-multi'), false);
    assert.equal(
      initial.repositoryStatuses.find(status => status.repository.id === 'D')?.status,
      'failed'
    );
    assert.deepEqual([...materializations.entries()].toSorted(), [
      ['A', 1],
      ['B', 1],
      ['C', 1],
      ['D', 1],
    ]);

    const failedAgain = await runtime.retryAsync(initial.runtimeId, 'D');
    assert.equal(
      failedAgain.repositoryStatuses.find(status => status.repository.id === 'D')?.status,
      'failed'
    );
    assert.deepEqual(
      repositoryNodes(failedAgain, ['A', 'B', 'C']),
      repositoryNodes(initial, ['A', 'B', 'C'])
    );

    failD = false;
    const retried = await runtime.retryAsync(initial.runtimeId, 'D');
    assert.equal(retried.workspace.ok, true);
    assert.equal(
      retried.repositoryStatuses.every(status => status.status === 'successful'),
      true
    );
    assert.deepEqual([...materializations.entries()].toSorted(), [
      ['A', 1],
      ['B', 1],
      ['C', 1],
      ['D', 3],
    ]);
    assert.deepEqual(
      repositoryNodes(retried, ['A', 'B', 'C']),
      repositoryNodes(initial, ['A', 'B', 'C'])
    );

    const unchanged = await runtime.loadAsync({ repositories, source: 'owner-a,owner-b' });
    assert.deepEqual([...materializations.entries()].toSorted(), [
      ['A', 1],
      ['B', 1],
      ['C', 1],
      ['D', 3],
    ]);
    assert.equal(unchanged.workspace.ok, true);
  });

  it('rejects forged identities, stale retries, and overlapping repository operations', async () => {
    const repositories = [repository('A', 'owner-a', 'catalog')];
    let releaseMaterialization: (() => void) | undefined;
    const runtime = createWorkspaceRepositoryRuntime({
      materializeAsync: async source => {
        await new Promise<void>(resolve => {
          releaseMaterialization = resolve;
        });
        return resolvedFixture(repositories[0], source);
      },
      resolveRevisionAsync: async url => ({
        repository: { id: repositories.find(candidate => candidate.url === url)?.id ?? '' },
        revision: { commitSha: 'A-sha' },
      }),
    });

    const loading = runtime.loadAsync({ repositories, source: 'owner-a' });
    await Promise.resolve();
    await assert.rejects(
      runtime.retryAsync('forged-runtime', 'A'),
      WorkspaceRepositoryRuntimeError
    );
    await assert.rejects(
      runtime.retryAsync('forged-runtime', 'missing'),
      WorkspaceRepositoryRuntimeError
    );
    releaseMaterialization?.();
    const loaded = await loading;
    await assert.rejects(runtime.retryAsync(loaded.runtimeId, 'A'), /Only failed repositories/);
  });

  it('rejects an overlapping retry without replacing the completed graph', async () => {
    const repositories = [
      repository('A', 'owner-a', 'catalog'),
      repository('D', 'owner-b', 'disconnected'),
    ];
    let failD = true;
    let releaseMaterialization: (() => void) | undefined;
    const runtime = createWorkspaceRepositoryRuntime({
      materializeAsync: async source => {
        if (source.kind !== 'github') throw new Error('Fixture requires GitHub sources.');
        const current = repositories.find(candidate => candidate.url === source.url);
        if (current === undefined) throw new Error('Unknown fixture repository.');
        if (current.id === 'D' && failD) throw new Error('D is unavailable.');
        if (current.id === 'D')
          await new Promise<void>(resolve => {
            releaseMaterialization = resolve;
          });
        return resolvedFixture(current, source);
      },
      resolveRevisionAsync: async url => ({
        repository: { id: repositories.find(candidate => candidate.url === url)?.id ?? '' },
        revision: { commitSha: `${url}-sha` },
      }),
    });

    const initial = await runtime.loadAsync({ repositories, source: 'owner-a,owner-b' });
    assert.equal(initial.workspace.ok, true);
    failD = false;
    const retry = runtime.retryAsync(initial.runtimeId, 'D');
    await Promise.resolve();
    await assert.rejects(
      runtime.retryAsync(initial.runtimeId, 'D'),
      /A workspace operation is already in progress/
    );
    releaseMaterialization?.();
    const completed = await retry;
    assert.equal(
      completed.repositoryStatuses.every(status => status.status === 'successful'),
      true
    );
  });
});

/*** Extract selected repository graph state so a retry can prove successful peers stay untouched. */
function repositoryNodes(
  result: Awaited<ReturnType<ReturnType<typeof createWorkspaceRepositoryRuntime>['loadAsync']>>,
  repositoryIds: readonly string[]
) {
  if (!result.workspace.ok) return [];
  return result.workspace.value.packageGraph.nodes.filter(node =>
    repositoryIds.includes(node.data.repositoryId ?? '')
  );
}

/*** Create one public GitHub discovery record for deterministic server-runtime coverage. */
function repository(id: string, owner: string, name: string) {
  return {
    id,
    name,
    owner,
    url: `https://github.com/${owner}/${name}`,
    visibility: 'public' as const,
  };
}

/*** Build the cleanup-safe fixture source returned after a controlled materialization delay. */
function resolvedFixture(
  repository: GitHubRepositoryDiscoveryRepository,
  source: Parameters<
    NonNullable<Parameters<typeof createWorkspaceRepositoryRuntime>[0]['materializeAsync']>
  >[0]
) {
  return {
    cleanupAsync: async () => {},
    projectName: repository.name,
    rootPath: resolve('test/fixtures/workspace-multi', repository.owner, repository.name),
    source,
  };
}
