import { assert, describe, it } from '@artiphishle/testosterone';
import { NextResponse } from 'next/server';

import { createGitHubCallbackRoute } from '@/features/github-auth/adapters/inbound/next/createGitHubCallbackRoute';
import { setGitHubAuthAttemptCookie } from '@/features/github-auth/adapters/inbound/next/githubAuthCookies';

process.env.ATLAS_GITHUB_OAUTH_COOKIE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

describe('[GitHub callback route]', () => {
  it('promotes an authenticated callback to an encrypted host-only session cookie', async () => {
    const GET = createGitHubCallbackRoute(async attempt => {
      assert.equal(attempt.state, 'state-a');
      return {
        outcome: 'authenticated',
        session: { accessToken: 'test-token', user: { id: 'user-a', username: 'user-a' } },
      };
    });
    const response = await GET(callbackRequest());

    assert.equal(response.status, 307);
    assert.equal(
      new URL(response.headers.get('location') ?? '').searchParams.get('githubAuth'),
      'signed-in'
    );
    const cookies = response.headers.getSetCookie().join('\n');
    assert.equal(cookies.includes('__Host-atlas-github-session='), true);
    assert.equal(cookies.includes('test-token'), false);
    assert.equal(cookies.includes('__Host-atlas-github-attempt=;'), true);
  });
});

/*** Create a browser-bound encrypted attempt cookie for the callback edge. */
function callbackRequest(): Request {
  const response = NextResponse.next();
  setGitHubAuthAttemptCookie(
    {
      attemptId: 'attempt-a',
      expiresAt: Date.now() + 60_000,
      redirectUri: 'https://atlas.test/api/auth/github/callback',
      state: 'state-a',
    },
    response.cookies
  );
  const cookie = response.headers.getSetCookie()[0]?.split(';')[0] ?? '';
  return new Request('https://atlas.test/api/auth/github/callback?code=code-a&state=state-a', {
    headers: { cookie },
  });
}
