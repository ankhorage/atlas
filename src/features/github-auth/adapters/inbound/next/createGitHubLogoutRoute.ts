import { NextResponse } from 'next/server';

import {
  clearGitHubAuthAttemptCookie,
  clearGitHubAuthSessionCookie,
} from '@/features/github-auth/adapters/inbound/next/githubAuthCookies';

/*** Create a same-origin logout route that only clears browser credentials after the server confirms session invalidation. */
export function createGitHubLogoutRoute(
  signOutAsync: (sessionId: string) => Promise<boolean>
): (request: Request) => Promise<Response> {
  return async request => {
    if (request.headers.get('origin') !== new URL(request.url).origin)
      return NextResponse.json({ error: 'Invalid logout origin.' }, { status: 403 });
    const sessionId = readSessionId(request.headers.get('cookie'));
    if (sessionId !== undefined && !(await signOutAsync(sessionId)))
      return NextResponse.json({ error: 'Unable to end the GitHub session.' }, { status: 503 });
    const response = NextResponse.redirect(new URL('/', request.url), 303);
    clearGitHubAuthAttemptCookie(response.cookies);
    clearGitHubAuthSessionCookie(response.cookies);
    return response;
  };
}

/*** Read the host-only opaque session cookie without accepting similarly named cookies. */
function readSessionId(cookieHeader: string | null): string | undefined {
  return cookieHeader?.match(/(?:^|;\\s*)__Host-atlas-github-session=([^;]+)/u)?.[1];
}
