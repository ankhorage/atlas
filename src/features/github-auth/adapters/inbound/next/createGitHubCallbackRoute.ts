import type { GitHubAuthorizationAttempt } from '@ankhorage/auth-github';
import type { AuthSession } from '@ankhorage/contracts/auth';
import { NextResponse } from 'next/server';

import {
  clearGitHubAuthAttemptCookie,
  clearGitHubAuthSessionCookie,
  readGitHubAuthAttempt,
  setGitHubAuthSessionCookie,
} from '@/features/github-auth/adapters/inbound/next/githubAuthCookies';

/*** Create the OAuth callback edge so failed session promotion never authenticates the pre-login browser identifier. */
export function createGitHubCallbackRoute(
  completeAuthorizationAsync: CompleteGitHubAuthorizationAsync
): (request: Request) => Promise<Response> {
  return async request => {
    const response = NextResponse.redirect(new URL('/', request.url));
    clearGitHubAuthAttemptCookie(response.cookies);
    const attempt = readGitHubAuthAttempt(request.headers.get('cookie'));
    if (attempt === undefined) return redirectWithOutcome(response, request.url, 'session-expired');
    const completed = await completeAuthorizationAsync(attempt, request.url);
    if (completed.outcome !== 'authenticated')
      return redirectWithOutcome(response, request.url, completed.outcome);
    try {
      setGitHubAuthSessionCookie(completed.session, response.cookies);
      return redirectWithOutcome(response, request.url, 'signed-in');
    } catch {
      clearGitHubAuthSessionCookie(response.cookies);
      return redirectWithOutcome(response, request.url, 'failed');
    }
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
  attempt: GitHubAuthorizationAttempt,
  requestUrl: string
) => Promise<
  | { readonly outcome: 'authenticated'; readonly session: AuthSession }
  | { readonly outcome: 'cancelled' | 'failed' | 'unavailable' }
>;
