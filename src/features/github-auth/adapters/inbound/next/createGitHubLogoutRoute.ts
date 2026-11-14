import { NextResponse } from 'next/server';

import {
  clearGitHubAuthAttemptCookie,
  clearGitHubAuthSessionCookie,
} from '@/features/github-auth/adapters/inbound/next/githubAuthCookies';

/*** Create a same-origin local logout route; stateless cookies cannot centrally revoke copied sessions. */
export function createGitHubLogoutRoute(
  signOutAsync: (cookieHeader: string | null) => Promise<boolean>
): (request: Request) => Promise<Response> {
  return async request => {
    if (request.headers.get('origin') !== new URL(request.url).origin)
      return NextResponse.json({ error: 'Invalid logout origin.' }, { status: 403 });
    if (!(await signOutAsync(request.headers.get('cookie'))))
      return NextResponse.json({ error: 'Unable to end the GitHub session.' }, { status: 503 });
    const response = NextResponse.redirect(new URL('/', request.url), 303);
    clearGitHubAuthAttemptCookie(response.cookies);
    clearGitHubAuthSessionCookie(response.cookies);
    return response;
  };
}
