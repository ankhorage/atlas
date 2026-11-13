import { NextResponse } from 'next/server';

import {
  clearGitHubAuthAttemptCookie,
  clearGitHubAuthSessionCookie,
} from '@/features/github-auth/adapters/inbound/next/githubAuthCookies';
import { createGitHubAuthAdapterAsync } from '@/features/github-auth/composition/createGitHubAuthAdapterAsync';

/*** Clear the server-side GitHub session through a same-origin sign-out request. */
export async function POST(request: Request): Promise<Response> {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return NextResponse.json({ error: 'Invalid logout origin.' }, { status: 403 });
  const response = NextResponse.redirect(new URL('/', request.url), 303);
  const sessionId = request.headers
    .get('cookie')
    ?.match(/__Host-atlas-github-session=([^;]+)/u)?.[1];
  if (sessionId !== undefined) {
    const auth = await createGitHubAuthAdapterAsync(sessionId);
    if (auth.available) await auth.adapter.signOut();
  }
  clearGitHubAuthAttemptCookie(response.cookies);
  clearGitHubAuthSessionCookie(response.cookies);
  return response;
}
