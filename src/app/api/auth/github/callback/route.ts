import { NextResponse } from 'next/server';

import {
  clearGitHubAuthAttemptCookie,
  clearGitHubAuthSessionCookie,
  ensureGitHubAuthSessionId,
  githubAuthCookieNames,
} from '@/features/github-auth/adapters/inbound/next/githubAuthCookies';
import {
  createGitHubAuthAdapterAsync,
  rotateGitHubAuthSessionAsync,
} from '@/features/github-auth/composition/createGitHubAuthAdapterAsync';

/*** Complete the exact registered GitHub callback with a one-use, browser-bound OAuth attempt. */
export async function GET(request: Request): Promise<Response> {
  const cookies = readCookies(request.headers.get('cookie'));
  const response = NextResponse.redirect(new URL('/', request.url));
  clearGitHubAuthAttemptCookie(response.cookies);
  if (cookies.sessionId === undefined || cookies.attemptId === undefined)
    return redirectWithOutcome(response, request.url, 'session-expired');

  const auth = await createGitHubAuthAdapterAsync(cookies.sessionId);
  if (!auth.available) return redirectWithOutcome(response, request.url, 'unavailable');
  const result = await auth.adapter.completeAuthorization({
    attemptId: cookies.attemptId,
    response: { type: 'callback', url: request.url },
  });
  if (!result.ok)
    return redirectWithOutcome(
      response,
      request.url,
      result.status === 'cancelled' ? 'cancelled' : 'failed'
    );
  const rotatedSessionId = ensureGitHubAuthSessionId(undefined, response.cookies);
  try {
    await rotateGitHubAuthSessionAsync(cookies.sessionId, rotatedSessionId, result.session);
    return redirectWithOutcome(response, request.url, 'signed-in');
  } catch {
    clearGitHubAuthSessionCookie(response.cookies);
    return redirectWithOutcome(response, request.url, 'failed');
  }
}

/*** Parse only the two host-owned opaque identifiers; all credential values remain server-side. */
function readCookies(value: string | null): {
  readonly attemptId?: string;
  readonly sessionId?: string;
} {
  const values = new Map(
    (value ?? '').split(';').flatMap(part => {
      const [key, ...rest] = part.trim().split('=');
      return rest.length === 0 ? [] : [[key, rest.join('=')]];
    })
  );
  return {
    attemptId: values.get(githubAuthCookieNames.attempt),
    sessionId: values.get(githubAuthCookieNames.session),
  };
}

/*** Redirect only to Atlas and expose a generic outcome that never reveals provider or token data. */
function redirectWithOutcome(
  response: NextResponse,
  requestUrl: string,
  outcome: string
): NextResponse {
  const destination = new URL('/', requestUrl);
  destination.searchParams.set('githubAuth', outcome);
  response.headers.set('location', destination.toString());
  return response;
}
