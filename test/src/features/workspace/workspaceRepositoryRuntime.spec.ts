import { resolve } from 'node:path';

import { assert, describe, it } from '@artiphishle/testosterone';

import type { GitHubRepositoryDiscoveryRepository } from '@ankhorage/repository/github';

import { inspectProjectForAnalysisAsync } from '@/features/project-analysis/adapters/outbound/project-detector/inspectProjectForAnalysisAsync';
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
    const progress: (readonly string[])[] = [];
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

    const initial = await runtime.loadAsync({
      repositories,
      source: 'owner-a,owner-b',
      onProgress: result => {
        progress.push(
          result.repositoryStatuses.map(status => `${status.repository.id}:${status.status}`)
        );
      },
    });
    assert.equal(initial.workspace.ok, true);
    if (!initial.workspace.ok) return;
    assert.deepEqual(
      initial.workspace.value.evaluation.cyclicPackages.map(cycle =>
        cycle.projects?.map(project => project.id)
      ),
      [['A', 'B'], ['C']]
    );
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
    assert.deepEqual(progress[0], ['A:loading', 'B:loading', 'C:loading', 'D:loading']);
    assert.equal(progress.length, 5);
    assert.equal(
      progress.slice(1, -1).some(update => update.some(status => status.endsWith(':successful'))),
      true
    );
    assert.deepEqual(
      progress.at(-1),
      initial.repositoryStatuses.map(status => `${status.repository.id}:${status.status}`)
    );

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

  it('removes deselected graph data immediately and reuses the immutable revision snapshot on reselect', async () => {
    const repositories = [
      repository('A', 'owner-a', 'catalog'),
      repository('B', 'owner-a', 'shared'),
    ];
    const materializations = new Map<string, number>();
    const runtime = createWorkspaceRepositoryRuntime({
      materializeAsync: async source => {
        if (source.kind !== 'github') throw new Error('Fixture requires GitHub sources.');
        const repository = repositories.find(candidate => candidate.url === source.url);
        if (repository === undefined) throw new Error('Unknown fixture repository.');
        materializations.set(repository.id, (materializations.get(repository.id) ?? 0) + 1);
        return resolvedFixture(repository, source);
      },
      resolveRevisionAsync: async url => ({
        repository: { id: repositories.find(candidate => candidate.url === url)?.id ?? '' },
        revision: { commitSha: `${url}-sha` },
      }),
    });
    const initial = await runtime.loadAsync({ repositories, source: 'owner-a' });
    const updates: string[][] = [];
    const removed = await runtime.updateAsync(initial.runtimeId, {
      addedRepositories: [],
      removedRepositoryIds: ['A'],
      onProgress: result => {
        updates.push(repositoryNodes(result, ['A', 'B']).map(node => node.data.repositoryId ?? ''));
      },
    });
    assert.deepEqual(
      repositoryNodes(removed, ['A']).map(node => node.data.repositoryId),
      []
    );
    assert.deepEqual([...materializations.entries()].toSorted(), [
      ['A', 1],
      ['B', 1],
    ]);
    const reselected = await runtime.updateAsync(removed.runtimeId, {
      addedRepositories: [repositories[0]],
      removedRepositoryIds: [],
    });
    assert.equal(repositoryNodes(reselected, ['A']).length > 0, true);
    assert.deepEqual([...materializations.entries()].toSorted(), [
      ['A', 1],
      ['B', 1],
    ]);
    assert.equal(updates.length, 1);
  });

  it('cancels a pending analysis when a removal-only update supersedes it', async () => {
    const repositories = [
      repository('A', 'owner-a', 'catalog'),
      repository('B', 'owner-a', 'shared'),
    ];
    let allowB = false;
    let cancellationObserved = false;
    let signalBegan: (() => void) | undefined;
    const bBegan = new Promise<void>(resolve => {
      signalBegan = resolve;
    });
    const runtime = createWorkspaceRepositoryRuntime({
      materializeAsync: async (source, signal) => {
        if (source.kind !== 'github') throw new Error('Fixture requires GitHub sources.');
        const current = repositories.find(candidate => candidate.url === source.url);
        if (current === undefined) throw new Error('Unknown fixture repository.');
        if (current.id === 'B' && !allowB) throw new Error('B is unavailable.');
        if (current.id === 'B')
          return new Promise((_, reject) => {
            signalBegan?.();
            signal?.addEventListener('abort', () => {
              cancellationObserved = true;
              reject(signal.reason);
            });
          });
        return resolvedFixture(current, source);
      },
      resolveRevisionAsync: async url => ({
        repository: { id: repositories.find(candidate => candidate.url === url)?.id ?? '' },
        revision: { commitSha: `${url}-sha` },
      }),
    });
    const initial = await runtime.loadAsync({ repositories, source: 'owner-a' });
    allowB = true;
    const retry = runtime.retryAsync(initial.runtimeId, 'B');
    await bBegan;
    const removed = await runtime.updateAsync(initial.runtimeId, {
      addedRepositories: [],
      removedRepositoryIds: ['B'],
    });
    await retry.catch(() => undefined);

    assert.equal(cancellationObserved, true);
    assert.deepEqual(
      removed.repositoryStatuses.map(status => status.repository.id),
      ['A']
    );
    assert.equal(repositoryNodes(removed, ['B']).length, 0);
  });

  it('resumes retained pending repositories through mixed rapid selection changes at 5, 20, and 80 repositories', async () => {
    for (const total of [5, 20, 80]) {
      const repositories = Array.from({ length: total }, (_, index) =>
        repository(`repository-${index}`, 'owner-a', `catalog-${index}`)
      );
      const fixtureRepository = repository('fixture', 'owner-a', 'catalog');
      const added = repository(`repository-${total}`, 'owner-b', `workspace-${total}`);
      const materializations = new Map<string, number>();
      const blockedIds = new Set(repositories.slice(1, 5).map(candidate => candidate.id));
      let activeMaterializations = 0;
      let maximumActiveMaterializations = 0;
      let allowReplacement = false;
      let runtimeId: string | undefined;
      let inspectionCount = 0;
      let initialWorkersBlocked: (() => void) | undefined;
      const initialWorkersAreBlocked = new Promise<void>(resolve => {
        initialWorkersBlocked = resolve;
      });
      const runtime = createWorkspaceRepositoryRuntime({
        inspectAsync: async path => {
          const inspection = await inspectProjectForAnalysisAsync(path);
          const suffix = inspectionCount++;
          return {
            ...inspection,
            packages: inspection.packages.map(project => ({
              ...project,
              name: project.name === undefined ? undefined : `${project.name}-${suffix}`,
            })),
          };
        },
        materializeAsync: async (source, signal) => {
          if (source.kind !== 'github') throw new Error('Fixture requires GitHub sources.');
          const current = [...repositories, added].find(candidate => candidate.url === source.url);
          if (current === undefined) throw new Error('Unknown fixture repository.');
          materializations.set(current.id, (materializations.get(current.id) ?? 0) + 1);
          activeMaterializations += 1;
          maximumActiveMaterializations = Math.max(
            maximumActiveMaterializations,
            activeMaterializations
          );
          try {
            if (!allowReplacement && current.id !== repositories[0].id)
              await new Promise<void>((_resolve, reject) => {
                if (blockedIds.delete(current.id) && blockedIds.size === 0)
                  initialWorkersBlocked?.();
                signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
              });
            return resolvedFixture(fixtureRepository, source);
          } finally {
            activeMaterializations -= 1;
          }
        },
        resolveRevisionAsync: async url => ({
          repository: {
            id: [...repositories, added].find(candidate => candidate.url === url)?.id ?? '',
          },
          revision: { commitSha: `${url}-sha` },
        }),
      });

      const initial = runtime.loadAsync({
        repositories,
        source: 'owner-a',
        onProgress: result => {
          runtimeId = result.runtimeId;
        },
      });
      const initialCompletion = initial.catch(() => undefined);
      await initialWorkersAreBlocked;
      allowReplacement = true;
      if (runtimeId === undefined) throw new Error('Initial workspace runtime was not published.');
      const afterMixedUpdate = await runtime.updateAsync(runtimeId, {
        addedRepositories: [added],
        removedRepositoryIds: [repositories[1].id],
      });
      await initialCompletion;

      assert.equal(afterMixedUpdate.repositoryStatuses.length, total);
      assert.deepEqual(
        afterMixedUpdate.repositoryStatuses.map(status => status.status),
        Array.from({ length: total }, () => 'successful')
      );
      assert.equal(
        afterMixedUpdate.repositoryStatuses.some(
          status => status.repository.id === repositories[1].id
        ),
        false
      );
      assert.equal(materializations.get(repositories[0].id), 1);
      assert.equal(maximumActiveMaterializations <= 4, true);

      const reselected = await runtime.updateAsync(afterMixedUpdate.runtimeId, {
        addedRepositories: [repositories[1]],
        removedRepositoryIds: [added.id],
      });
      assert.equal(
        reselected.repositoryStatuses.every(status => status.status === 'successful'),
        true
      );
      assert.equal(
        reselected.repositoryStatuses.some(status => status.repository.id === added.id),
        false
      );
      assert.equal(materializations.get(repositories[0].id), 1);
    }
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
