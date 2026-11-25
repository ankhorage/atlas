import { NextResponse } from 'next/server';

import {
  clearGitHubAuthAttemptCookie,
  clearGitHubAuthReturnToCookie,
  clearGitHubAuthSessionCookie,
  clearGitHubPrivateAccessCookie,
  clearGitHubPrivateAccessRequestCookie,
} from '@/features/github-auth/adapters/inbound/next/githubAuthCookies';

/*** Create a same-origin logout route that clears this browser's local session, not copied stateless cookies. */
export function createGitHubLogoutRoute(
  signOutAsync: (cookieHeader: string | null) => Promise<boolean>
): (request: Request) => Promise<Response> {
  return async request => {
    if (request.headers.get('origin') !== new URL(request.url).origin)
      return NextResponse.json({ error: 'Invalid logout origin.' }, { status: 403 });
    await clearAdapterSessionAsync(signOutAsync, request.headers.get('cookie'));
    const response = NextResponse.redirect(new URL('/', request.url), 303);
    clearGitHubAuthAttemptCookie(response.cookies);
    clearGitHubAuthSessionCookie(response.cookies);
    clearGitHubAuthReturnToCookie(response.cookies);
    clearGitHubPrivateAccessCookie(response.cookies);
    clearGitHubPrivateAccessRequestCookie(response.cookies);
    return response;
  };
}

/*** Attempt provider cleanup without allowing an unavailable provider to retain browser credentials. */
async function clearAdapterSessionAsync(
  signOutAsync: (cookieHeader: string | null) => Promise<boolean>,
  cookieHeader: string | null
): Promise<void> {
  try {
    await signOutAsync(cookieHeader);
  } catch {
    // The encrypted browser cookie is the local authorization boundary and is cleared by the caller.
  }
}
