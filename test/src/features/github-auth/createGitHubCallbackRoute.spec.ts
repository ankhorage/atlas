import { assert, describe, it } from '@artiphishle/testosterone';
import { NextResponse } from 'next/server';

import { createGitHubCallbackRoute } from '@/features/github-auth/adapters/inbound/next/createGitHubCallbackRoute';
import {
  readGitHubAuthAttempt,
  readGitHubAuthSession,
  setGitHubAuthAttemptCookie,
  setGitHubAuthSessionCookie,
} from '@/features/github-auth/adapters/inbound/next/githubAuthCookies';

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

  it('rejects tampered cookie ciphertext', () => {
    const cookie = sessionCookie({ expiresAt: Date.now() + 60_000 });
    const [name, iv, tag, ciphertext] = cookie.match(/^(.*)=([^.]+)\.([^.]+)\.([^.]+)$/u) ?? [];
    const tamperedCiphertext = `${ciphertext?.startsWith('a') ? 'b' : 'a'}${ciphertext?.slice(1)}`;
    const tampered = `${name}=${iv}.${tag}.${tamperedCiphertext}`;

    assert.equal(readGitHubAuthSession(tampered), undefined);
  });

  it('rejects expired attempt and session cookies even when the cookie header is retained', () => {
    assert.equal(readGitHubAuthAttempt(attemptCookie(Date.now() - 1)), undefined);
    assert.equal(readGitHubAuthSession(sessionCookie({ expiresAt: Date.now() - 1 })), undefined);
  });

  it('rejects an encrypted cookie sealed for the wrong purpose', () => {
    const attempt = attemptCookie(Date.now() + 60_000);
    const sessionName = '__Host-atlas-github-session=';
    const wrongPurpose = `${sessionName}${attempt.slice(attempt.indexOf('=') + 1)}`;

    assert.equal(readGitHubAuthSession(wrongPurpose), undefined);
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

/*** Issue an encrypted attempt cookie with a caller-defined expiry for cookie-security tests. */
function attemptCookie(expiresAt: number): string {
  const response = NextResponse.next();
  setGitHubAuthAttemptCookie(
    {
      attemptId: 'attempt-a',
      expiresAt,
      redirectUri: 'https://atlas.test/api/auth/github/callback',
      state: 'state-a',
    },
    response.cookies
  );
  return response.headers.getSetCookie()[0]?.split(';')[0] ?? '';
}

/*** Issue an encrypted session cookie with a caller-defined expiry for cookie-security tests. */
function sessionCookie(session: { readonly expiresAt: number }): string {
  const response = NextResponse.next();
  setGitHubAuthSessionCookie(
    {
      accessToken: 'test-token',
      expiresAt: session.expiresAt,
      user: { id: 'user-a', username: 'user-a' },
    },
    response.cookies
  );
  return response.headers.getSetCookie()[0]?.split(';')[0] ?? '';
}
