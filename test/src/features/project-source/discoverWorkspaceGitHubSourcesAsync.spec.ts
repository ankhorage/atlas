import { assert, describe, it } from '@artiphishle/testosterone';

import { discoverWorkspaceGitHubSourcesAsync } from '@/features/project-source/composition/discoverWorkspaceGitHubSourcesAsync';

describe('[discoverWorkspaceGitHubSourcesAsync]', () => {
  it('filters the authenticated inventory by owner without dropping private organization or collaborator repositories', async () => {
    const result = await discoverWorkspaceGitHubSourcesAsync(
      'beindividualworld',
      new Set(),
      undefined,
      { kind: 'user', accessToken: 'test-token' },
      async () => ({
        repositories: [
          repository('personal', 'artiphishle', 'personal', 'private'),
          repository(
            'organization-private',
            'beindividualworld',
            'organization-private',
            'private'
          ),
          repository('organization-public', 'beindividualworld', 'organization-public', 'public'),
          repository('collaborator', 'another-owner', 'collaborator', 'private'),
        ],
      })
    );

    assert.deepEqual(
      result.repositories.map(repository => [
        repository.owner,
        repository.name,
        repository.visibility,
      ]),
      [
        ['beindividualworld', 'organization-private', 'private'],
        ['beindividualworld', 'organization-public', 'public'],
      ]
    );
    assert.deepEqual(result.selectedRepositories, []);
  });

  it('keeps every authorized repository in the authenticated @me inventory', async () => {
    const repositories = [
      repository('personal', 'artiphishle', 'personal', 'private'),
      repository('organization', 'beindividualworld', 'organization', 'private'),
      repository('collaborator', 'another-owner', 'collaborator', 'public'),
    ];

    const result = await discoverWorkspaceGitHubSourcesAsync(
      '@me',
      new Set(['organization']),
      'all',
      { kind: 'user', accessToken: 'test-token' },
      async () => ({ repositories })
    );

    assert.deepEqual(
      result.repositories.map(repository => repository.id),
      ['collaborator', 'personal', 'organization']
    );
    assert.deepEqual(
      result.selectedRepositories.map(repository => repository.id),
      ['collaborator', 'personal']
    );
  });

  it('keeps public owner discovery available when GitHub declines the authenticated inventory', async () => {
    const publicRepository = repository('atlas', 'ankhorage', 'atlas', 'public');
    const result = await discoverWorkspaceGitHubSourcesAsync(
      'ankhorage',
      new Set(),
      undefined,
      { kind: 'user', accessToken: 'test-token' },
      async () => {
        throw new Error('GitHub denied the authenticated inventory.');
      },
      async input => {
        assert.deepEqual(input, {
          authentication: { kind: 'user', accessToken: 'test-token' },
          source: 'ankhorage',
        });
        return {
          owner: { login: 'ankhorage', type: 'organization', url: 'https://github.com/ankhorage' },
          repositories: [publicRepository],
        };
      }
    );

    assert.deepEqual(result.repositories, [publicRepository]);
  });
});

/*** Creates a credential-free Repository inventory record for authenticated discovery tests. */
function repository(id: string, owner: string, name: string, visibility: 'private' | 'public') {
  return { id, name, owner, url: `https://github.com/${owner}/${name}`, visibility } as const;
}
