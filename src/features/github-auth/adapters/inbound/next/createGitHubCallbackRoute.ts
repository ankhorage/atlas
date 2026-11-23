import type { GitHubAuthorizationAttempt } from '@ankhorage/auth-github';
import type { AuthSession } from '@ankhorage/contracts/auth';
import { NextResponse } from 'next/server';

import {
  clearGitHubAuthAttemptCookie,
  clearGitHubAuthReturnToCookie,
  clearGitHubAuthSessionCookie,
  clearGitHubPrivateAccessRequestCookie,
  readGitHubAuthAttempt,
  readGitHubAuthReturnTo,
  readGitHubPrivateAccessRequest,
  setGitHubAuthSessionCookie,
  setGitHubPrivateAccessCookie,
} from '@/features/github-auth/adapters/inbound/next/githubAuthCookies';

/*** Create the OAuth callback edge so failed session promotion never authenticates the pre-login browser identifier. */
export function createGitHubCallbackRoute(
  completeAuthorizationAsync: CompleteGitHubAuthorizationAsync
): (request: Request) => Promise<Response> {
  return async request => {
    const cookieHeader = request.headers.get('cookie');
    const returnTo = readGitHubAuthReturnTo(cookieHeader) ?? '/';
    const privateAccessRequested = readGitHubPrivateAccessRequest(cookieHeader);
    const response = NextResponse.redirect(new URL(returnTo, request.url));
    clearGitHubAuthAttemptCookie(response.cookies);
    clearGitHubAuthReturnToCookie(response.cookies);
    clearGitHubPrivateAccessRequestCookie(response.cookies);
    const attempt = readGitHubAuthAttempt(cookieHeader);
    if (attempt === undefined)
      return redirectWithOutcome(response, returnTo, request.url, 'session-expired');
    const completed = await completeAuthorizationAsync(attempt, request.url);
    if (completed.outcome !== 'authenticated')
      return redirectWithOutcome(response, returnTo, request.url, completed.outcome);
    try {
      setGitHubAuthSessionCookie(completed.session, response.cookies);
      if (privateAccessRequested) setGitHubPrivateAccessCookie(response.cookies);
      return redirectWithOutcome(response, returnTo, request.url, 'signed-in');
    } catch {
      clearGitHubAuthSessionCookie(response.cookies);
      return redirectWithOutcome(response, returnTo, request.url, 'failed');
    }
  };
}

/*** Redirect only to Atlas and expose a generic outcome that never reveals provider or token data. */
function redirectWithOutcome(
  response: NextResponse,
  returnTo: string,
  requestUrl: string,
  outcome: string
): NextResponse {
  const destination = new URL(returnTo, requestUrl);
  destination.searchParams.set('githubAuth', outcome);
  response.headers.set('location', destination.toString());
  return response;
}

type CompleteGitHubAuthorizationAsync = (
  attempt: GitHubAuthorizationAttempt,
  requestUrl: string
) => Promise<
  | { readonly outcome: 'authenticated'; readonly session: AuthSession }
  | { readonly outcome: 'cancelled' | 'failed' | 'unavailable' }
>;
