import { NextResponse } from 'next/server';

import {
  ensureGitHubAuthSessionId,
  setGitHubAuthAttemptCookie,
} from '@/features/github-auth/adapters/inbound/next/githubAuthCookies';
import {
  githubAuthConfiguration,
  githubAuthorizationScopes,
} from '@/features/github-auth/application/githubAuthConfiguration';
import { createGitHubAuthAdapterAsync } from '@/features/github-auth/composition/createGitHubAuthAdapterAsync';

/*** Start a CSRF-protected GitHub OAuth authorization using an opaque browser session. */
export async function POST(request: Request): Promise<Response> {
  if (!hasTrustedOrigin(request))
    return NextResponse.json({ error: 'Invalid login origin.' }, { status: 403 });

  const form = await request.formData();
  const wantsPrivateRepositoryAccess = form.get('privateRepositoryAccess') === 'true';
  const response = NextResponse.redirect(new URL('/', request.url), 303);
  const sessionId = ensureGitHubAuthSessionId(
    request.headers.get('cookie')?.match(/__Host-atlas-github-session=([^;]+)/u)?.[1],
    response.cookies
  );
  const auth = await createGitHubAuthAdapterAsync(sessionId);
  if (!auth.available) return NextResponse.json({ error: auth.message }, { status: 503 });

  const result = await auth.adapter.startAuthorization({
    provider: 'github',
    redirectUri: githubAuthConfiguration.callbackUrl,
    scopes: githubAuthorizationScopes(wantsPrivateRepositoryAccess),
  });
  if (!result.ok)
    return NextResponse.json({ error: 'GitHub authorization could not start.' }, { status: 503 });

  const authorizationUrl = new URL(result.data.authorizationUrl);
  if (authorizationUrl.protocol !== 'https:' || authorizationUrl.hostname !== 'github.com')
    return NextResponse.json({ error: 'GitHub authorization could not start.' }, { status: 503 });
  setGitHubAuthAttemptCookie(result.data.attemptId, response.cookies);
  response.headers.set('location', authorizationUrl.toString());
  return response;
}

/*** Require a same-origin POST before a browser can create an OAuth attempt. */
function hasTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return origin !== null && origin === new URL(request.url).origin;
}
