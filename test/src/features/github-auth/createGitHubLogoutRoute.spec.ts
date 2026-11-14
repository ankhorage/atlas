import { assert, describe, it } from '@artiphishle/testosterone';

import { createGitHubLogoutRoute } from '@/features/github-auth/adapters/inbound/next/createGitHubLogoutRoute';

describe('[GitHub logout route]', () => {
  it('clears both host cookies after the local adapter session is cleared', async () => {
    const headers: (string | null)[] = [];
    const POST = createGitHubLogoutRoute(async cookieHeader => {
      headers.push(cookieHeader);
      return true;
    });
    const response = await POST(logoutRequest());

    assert.equal(response.status, 303);
    assert.deepEqual(headers, ['__Host-atlas-github-session=encrypted-value']);
    assert.equal(
      response.headers.getSetCookie().join('\n').includes('__Host-atlas-github-session=;'),
      true
    );
    assert.equal(
      response.headers.getSetCookie().join('\n').includes('__Host-atlas-github-attempt=;'),
      true
    );
  });

  it('fails closed when the local adapter cannot clear its request-scoped session', async () => {
    const POST = createGitHubLogoutRoute(async () => false);
    const response = await POST(logoutRequest());

    assert.equal(response.status, 503);
    assert.equal(response.headers.get('location'), null);
  });
});

/*** Build a same-origin logout request carrying an opaque encrypted session cookie. */
function logoutRequest(): Request {
  return new Request('https://atlas.test/api/auth/github/logout', {
    headers: {
      cookie: '__Host-atlas-github-session=encrypted-value',
      origin: 'https://atlas.test',
    },
    method: 'POST',
  });
}
