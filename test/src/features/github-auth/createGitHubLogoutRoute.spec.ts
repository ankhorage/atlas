import { assert, describe, it } from '@artiphishle/testosterone';

import { createGitHubLogoutRoute } from '@/features/github-auth/adapters/inbound/next/createGitHubLogoutRoute';

describe('[GitHub logout route]', () => {
  it('clears both host cookies only after server-side invalidation succeeds', async () => {
    const invalidated: string[] = [];
    const POST = createGitHubLogoutRoute(async sessionId => {
      invalidated.push(sessionId);
      return true;
    });

    const response = await POST(logoutRequest('session-a'));

    assert.equal(response.status, 303);
    assert.deepEqual(invalidated, ['session-a']);
    assert.equal(
      response.headers.getSetCookie().join('\n').includes('__Host-atlas-github-session=;'),
      true
    );
    assert.equal(
      response.headers.getSetCookie().join('\n').includes('__Host-atlas-github-attempt=;'),
      true
    );
  });

  it('fails closed on storage failures and does not issue a successful logout redirect', async () => {
    const POST = createGitHubLogoutRoute(async () => false);

    const response = await POST(logoutRequest('session-a'));

    assert.equal(response.status, 503);
    assert.equal(response.headers.get('location'), null);
    assert.equal(
      ((await response.json()) as { readonly error: string }).error,
      'Unable to end the GitHub session.'
    );
  });

  it('cannot replay a session after one successful logout', async () => {
    const activeSessions = new Set(['session-a']);
    const POST = createGitHubLogoutRoute(async sessionId => activeSessions.delete(sessionId));

    assert.equal((await POST(logoutRequest('session-a'))).status, 303);
    assert.equal(activeSessions.has('session-a'), false);
    assert.equal((await POST(logoutRequest('session-a'))).status, 503);
  });
});

/*** Build a same-origin POST carrying only the opaque host session identifier. */
function logoutRequest(sessionId: string): Request {
  return new Request('https://atlas.test/api/auth/github/logout', {
    headers: {
      cookie: `__Host-atlas-github-session=${sessionId}`,
      origin: 'https://atlas.test',
    },
    method: 'POST',
  });
}
