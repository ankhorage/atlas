import type { AuthSession } from '@ankhorage/contracts/auth';
import { NextResponse } from 'next/server';

import {
  clearGitHubAuthAttemptCookie,
  clearGitHubAuthSessionCookie,
  ensureGitHubAuthSessionId,
  githubAuthCookieNames,
} from '@/features/github-auth/adapters/inbound/next/githubAuthCookies';

/*** Create the OAuth callback edge so failed session promotion never authenticates the pre-login browser identifier. */
export function createGitHubCallbackRoute(
  completeAuthorizationAsync: CompleteGitHubAuthorizationAsync,
  rotateSessionAsync: RotateGitHubSessionAsync
): (request: Request) => Promise<Response> {
  return async request => {
    const cookies = readCookies(request.headers.get('cookie'));
    const response = NextResponse.redirect(new URL('/', request.url));
    clearGitHubAuthAttemptCookie(response.cookies);
    if (cookies.sessionId === undefined || cookies.attemptId === undefined)
      return redirectWithOutcome(response, request.url, 'session-expired');
    const completed = await completeAuthorizationAsync(
      cookies.sessionId,
      cookies.attemptId,
      request.url
    );
    if (completed.outcome !== 'authenticated')
      return redirectWithOutcome(response, request.url, completed.outcome);
    const rotatedSessionId = ensureGitHubAuthSessionId(undefined, response.cookies);
    try {
      await rotateSessionAsync(cookies.sessionId, rotatedSessionId, completed.session);
      return redirectWithOutcome(response, request.url, 'signed-in');
    } catch {
      clearGitHubAuthSessionCookie(response.cookies);
      return redirectWithOutcome(response, request.url, 'failed');
    }
  };
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

type CompleteGitHubAuthorizationAsync = (
  sessionId: string,
  attemptId: string,
  requestUrl: string
) => Promise<
  | { readonly outcome: 'authenticated'; readonly session: AuthSession }
  | { readonly outcome: 'cancelled' | 'failed' | 'unavailable' }
>;

type RotateGitHubSessionAsync = (
  previousSessionId: string,
  nextSessionId: string,
  session: AuthSession
) => Promise<void>;
