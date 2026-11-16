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
    assertHostCookieTombstones(response.headers.getSetCookie());
  });

  it('clears both host cookies when the local adapter cannot clear its request-scoped session', async () => {
    const POST = createGitHubLogoutRoute(async () => false);
    const response = await POST(logoutRequest());

    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), 'https://atlas.test/');
    assertHostCookieTombstones(response.headers.getSetCookie());
  });

  it('clears both host cookies when adapter cleanup throws', async () => {
    const POST = createGitHubLogoutRoute(async () => {
      throw new Error('GitHub is unavailable');
    });
    const response = await POST(logoutRequest());

    assert.equal(response.status, 303);
    assertHostCookieTombstones(response.headers.getSetCookie());
  });

  it('rejects a cross-origin request without calling the adapter or clearing cookies', async () => {
    let calls = 0;
    const POST = createGitHubLogoutRoute(async () => {
      calls += 1;
      return true;
    });
    const response = await POST(
      new Request('https://atlas.test/api/auth/github/logout', {
        headers: {
          cookie: '__Host-atlas-github-session=encrypted-value',
          origin: 'https://attacker.test',
        },
        method: 'POST',
      })
    );

    assert.equal(response.status, 403);
    assert.equal(calls, 0);
    assert.equal(response.headers.getSetCookie().length, 0);
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

/*** Assert both browser-owned cookie tombstones preserve the __Host- cookie invariants. */
function assertHostCookieTombstones(setCookies: string[]): void {
  for (const name of ['__Host-atlas-github-session', '__Host-atlas-github-attempt']) {
    const cookie = setCookies.find(value => value.startsWith(`${name}=;`));
    assert.equal(cookie === undefined, false);
    assert.equal(cookie?.includes('Secure'), true);
    assert.equal(cookie?.includes('Path=/'), true);
    assert.equal(cookie?.includes('Max-Age=0'), true);
    assert.equal(cookie?.includes('Expires=Thu, 01 Jan 1970 00:00:00 GMT'), true);
    assert.equal(cookie?.includes('Domain='), false);
  }
}
