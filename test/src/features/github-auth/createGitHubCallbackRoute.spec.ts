import { assert, describe, it } from '@artiphishle/testosterone';

import { createGitHubCallbackRoute } from '@/features/github-auth/adapters/inbound/next/createGitHubCallbackRoute';

describe('[GitHub callback route]', () => {
  it('clears the browser session and reports failure when promotion cannot commit', async () => {
    const GET = createGitHubCallbackRoute(
      async () => ({
        outcome: 'authenticated',
        session: { accessToken: 'test-token', user: { id: 'user-a', username: 'user-a' } },
      }),
      async () => Promise.reject(new Error('rotation failed before commit'))
    );

    const response = await GET(callbackRequest('original-session', 'attempt-a'));

    assert.equal(response.status, 307);
    assert.equal(
      new URL(response.headers.get('location') ?? '').searchParams.get('githubAuth'),
      'failed'
    );
    assert.equal(
      response.headers.getSetCookie().join('\n').includes('__Host-atlas-github-session=;'),
      true
    );
  });
});

/*** Construct a provider callback containing only the host-owned opaque identifiers. */
function callbackRequest(sessionId: string, attemptId: string): Request {
  return new Request('https://atlas.test/api/auth/github/callback?code=code-a&state=state-a', {
    headers: {
      cookie: `__Host-atlas-github-session=${sessionId}; __Host-atlas-github-attempt=${attemptId}`,
    },
  });
}
