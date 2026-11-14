import { assert, describe, it } from '@artiphishle/testosterone';

import { createWorkspaceInventoryRoute } from '@/features/workspace/adapters/inbound/next/createWorkspaceInventoryRoute';

describe('[workspace inventory route]', () => {
  it('discovers an authorized owner inventory without materializing repositories or caching the response', async () => {
    const requests: string[] = [];
    const GET = createWorkspaceInventoryRoute(async owner => {
      requests.push(owner);
      return {
        owner,
        repositories: [
          {
            id: 'atlas',
            name: 'atlas',
            owner,
            url: 'https://github.com/ankhorage/atlas',
            visibility: 'public',
          },
        ],
      };
    });

    const response = await GET(
      new Request('http://atlas.test/api/workspace/inventory?owner=Ankhorage')
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(requests, ['Ankhorage']);
    assert.deepEqual(await response.json(), {
      owner: 'Ankhorage',
      repositories: [
        {
          id: 'atlas',
          name: 'atlas',
          owner: 'Ankhorage',
          url: 'https://github.com/ankhorage/atlas',
          visibility: 'public',
        },
      ],
    });
  });

  it('rejects URL-shaped owner input before discovery', async () => {
    const GET = createWorkspaceInventoryRoute(async () => {
      throw new Error('Discovery must not run.');
    });

    const response = await GET(
      new Request(
        'http://atlas.test/api/workspace/inventory?owner=https%3A%2F%2Fgithub.com%2Fankhorage'
      )
    );

    assert.equal(response.status, 400);
  });
});
