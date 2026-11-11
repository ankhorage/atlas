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
    const materializedRevisions: string[] = [];
    const result = await loadWorkspaceProjectSourceAsync(
      'owner-a,owner-b|include=owner-a-catalog,owner-a-shared,owner-b-workspace,owner-b-disconnected,owner-b-failed',
      async () => ({ edges: [], nodes: [] }),
      async source => {
        if (source.kind !== 'github') throw new Error('Fixture only materializes GitHub sources.');
        materializedRevisions.push(source.revision ?? 'missing');
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
      }),
      undefined,
      resolveRevision
    );

    assert.equal(result.workspace.ok, true);
    assert.equal(result.projectName, 'GitHub workspace');
    assert.equal(result.repositories?.length, 5);
    assert.deepEqual(materializedRevisions.toSorted(), [
      'owner-a-catalog-commit',
      'owner-a-shared-commit',
      'owner-b-disconnected-commit',
      'owner-b-failed-commit',
      'owner-b-workspace-commit',
    ]);
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

  it('discovers an owner before materializing any repository', async () => {
    const materialized: string[] = [];
    const result = await loadWorkspaceProjectSourceAsync(
      'owner-a',
      async () => ({ edges: [], nodes: [] }),
      async source => {
        if (source.kind === 'github') materialized.push(source.url);
        throw new Error('Discovery must not materialize a repository.');
      },
      async () => ({
        repositories: [repository('owner-a-catalog', 'owner-a', 'catalog')],
        selectedRepositories: [],
      })
    );

    assert.equal(result.selectionRequired, true);
    assert.deepEqual(materialized, []);
    assert.deepEqual(
      result.repositories?.map(item => [item.id, item.selected]),
      [['owner-a-catalog', false]]
    );
  });

  it('materializes only repository ids selected from the server-discovered owner inventory', async () => {
    const repositories = [
      repository('owner-a-catalog', 'owner-a', 'catalog'),
      repository('owner-a-shared', 'owner-a', 'shared'),
      repository('owner-a-excluded', 'owner-a', 'excluded'),
    ];
    const materialized: string[] = [];
    const result = await loadWorkspaceProjectSourceAsync(
      'owner-a|include=owner-a-catalog,owner-a-shared',
      async () => ({ edges: [], nodes: [] }),
      async source => {
        if (source.kind !== 'github') throw new Error('Fixture only materializes GitHub sources.');
        materialized.push(source.url);
        const selected = repositories.find(repository => repository.url === source.url);
        if (selected === undefined) throw new Error('Unexpected repository materialization.');
        return {
          source,
          rootPath: resolve('test/fixtures/workspace-multi', selected.owner, selected.name),
          projectName: selected.name,
          cleanupAsync: async () => {},
        };
      },
      async (_source, _excluded, selected) => ({
        repositories,
        selectedRepositories:
          selected === 'all'
            ? repositories
            : repositories.filter(repository => selected?.has(repository.id)),
      }),
      undefined,
      resolveRevision
    );

    assert.equal(result.workspace.ok, true);
    assert.deepEqual(materialized.toSorted(), [
      'https://github.com/owner-a/catalog',
      'https://github.com/owner-a/shared',
    ]);
    assert.deepEqual(
      result.repositories?.map(repository => [repository.id, repository.selected]),
      [
        ['owner-a-catalog', true],
        ['owner-a-shared', true],
        ['owner-a-excluded', false],
      ]
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
      'ankhorage,another-owner|include=repository-good,repository-broken',
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
      }),
      undefined,
      resolveRevision
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

/*** Resolve fixture repositories to deterministic immutable commits without network access. */
async function resolveRevision(url: string) {
  const [, owner, name] = new URL(url).pathname.split('/');
  if (owner === undefined || name === undefined)
    throw new Error('Fixture repository URL is invalid.');
  return {
    repository: {
      id: `${owner}-${name}`,
      owner,
      name,
      url,
      defaultBranch: 'main',
    },
    revision: { commitSha: `${owner}-${name}-commit`, ref: 'main' },
  };
}
