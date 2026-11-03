import { resolve } from 'node:path';

import { assert, describe, it } from '@artiphishle/testosterone';

import { loadWorkspaceProjectSourceAsync } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

describe('[loadWorkspaceProjectSourceAsync]', () => {
  it('analyzes a deterministic multi-owner fixture through discovery, materialization, and the canonical graph', async () => {
    const fixtureRoot = resolve('test/fixtures/workspace-multi');
    const repositories = [
      repository('owner-a-catalog', 'owner-a', 'catalog'),
      repository('owner-a-shared', 'owner-a', 'shared'),
      repository('owner-b-workspace', 'owner-b', 'workspace'),
      repository('owner-b-disconnected', 'owner-b', 'disconnected'),
      repository('owner-b-failed', 'owner-b', 'failed'),
    ];
    const result = await loadWorkspaceProjectSourceAsync(
      'owner-a,owner-b',
      async () => ({ edges: [], nodes: [] }),
      async source => {
        if (source.kind !== 'github') throw new Error('Fixture only materializes GitHub sources.');
        const repository = repositories.find(item => item.url === source.url);
        if (repository === undefined || repository.id === 'owner-b-failed')
          throw new Error('Fixture materialization failed.');
        return {
          source,
          rootPath: resolve(fixtureRoot, repository.owner, repository.name),
          projectName: repository.name,
          cleanupAsync: async () => {},
        };
      },
      async (owner, excluded) => ({
        repositories,
        selectedRepositories: repositories
          .filter(repository => repository.owner === owner || owner.includes(repository.owner))
          .filter(repository => !excluded.has(repository.id)),
      })
    );

    assert.equal(result.workspace.ok, true);
    assert.equal(result.projectName, 'GitHub workspace');
    assert.equal(result.repositories?.length, 5);
    assert.equal(
      result.repositoryStatuses?.some(status => status.repository.id === 'owner-b-failed'),
      true
    );
    if (!result.workspace.ok) return;
    assert.equal(result.workspace.value.tree.length, 2);
    assert.equal(
      result.workspace.value.tree.some(node => node.label === 'owner-a'),
      true
    );
    assert.equal(
      result.workspace.value.tree.some(node => node.label === 'owner-b'),
      true
    );
  });

  it('loads the local project configured at server runtime', async () => {
    const previousProjectPath = process.env.ATLAS_PROJECT_PATH;
    process.env.ATLAS_PROJECT_PATH = resolve('examples/java/my-app');

    try {
      const result = await loadWorkspaceProjectSourceAsync(undefined, async () => ({
        edges: [],
        nodes: [],
      }));

      assert.equal(result.projectName, 'my-app');
      assert.equal(result.workspace.ok, true);
    } finally {
      if (previousProjectPath === undefined) delete process.env.ATLAS_PROJECT_PATH;
      else process.env.ATLAS_PROJECT_PATH = previousProjectPath;
    }
  });

  it('keeps a rejected action as workspace state after GitHub materialization', async () => {
    const result = await loadWorkspaceProjectSourceAsync(
      'ankhorage/atlas',
      async () => {
        throw new Error('Dependency analysis failed.');
      },
      async source => ({
        source,
        rootPath: resolve('examples/java/my-app'),
        projectName: 'atlas',
        cleanupAsync: async () => {},
      })
    );

    assert.deepEqual(result.workspace, { ok: false, error: 'Dependency analysis failed.' });
    assert.equal(result.projectName, 'atlas');
  });

  it('keeps GitHub materialization errors distinct from action errors', async () => {
    const result = await loadWorkspaceProjectSourceAsync(
      'ankhorage/atlas',
      async () => {
        throw new Error('The action must not run.');
      },
      async () => {
        throw new Error('Unable to materialize GitHub repository.');
      }
    );

    assert.deepEqual(result.workspace, {
      ok: false,
      error: 'Unable to materialize GitHub repository.',
    });
  });

  it('keeps a successful repository workspace visible with a sanitized failed-repository status', async () => {
    const result = await loadWorkspaceProjectSourceAsync(
      'ankhorage,another-owner',
      async () => ({ edges: [], nodes: [] }),
      async source => {
        if (source.kind === 'github' && source.url.endsWith('/broken'))
          throw new Error('token=secret /private/tmp/checkout');
        return {
          source,
          rootPath: resolve('examples/java/my-app'),
          projectName: 'my-app',
          cleanupAsync: async () => {},
        };
      },
      async () => ({
        repositories: [
          {
            id: 'repository-good',
            name: 'atlas-ui',
            owner: 'ankhorage',
            url: 'https://github.com/ankhorage/atlas-ui',
            visibility: 'public',
          },
          {
            id: 'repository-broken',
            name: 'broken',
            owner: 'another-owner',
            url: 'https://github.com/another-owner/broken',
            visibility: 'public',
          },
        ],
        selectedRepositories: [
          {
            id: 'repository-good',
            name: 'atlas-ui',
            owner: 'ankhorage',
            url: 'https://github.com/ankhorage/atlas-ui',
            visibility: 'public',
          },
          {
            id: 'repository-broken',
            name: 'broken',
            owner: 'another-owner',
            url: 'https://github.com/another-owner/broken',
            visibility: 'public',
          },
        ],
      })
    );

    assert.equal(result.workspace.ok, true);
    assert.deepEqual(result.repositoryStatuses, [
      {
        description: 'Repository materialization failed.',
        repository: { id: 'repository-broken', name: 'broken', owner: 'another-owner' },
        status: 'failed',
      },
      {
        repository: { id: 'repository-good', name: 'atlas-ui', owner: 'ankhorage' },
        status: 'successful',
      },
    ]);
  });
});

function repository(id: string, owner: string, name: string) {
  return {
    id,
    name,
    owner,
    url: `https://github.com/${owner}/${name}`,
    visibility: 'public' as const,
  };
}
