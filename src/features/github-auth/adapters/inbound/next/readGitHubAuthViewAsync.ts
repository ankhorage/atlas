import type { GitHubRepositoryAuthentication } from '@ankhorage/repository/github';
import { cookies } from 'next/headers';

import { githubAuthCookieNames } from '@/features/github-auth/adapters/inbound/next/githubAuthCookies';
import { createGitHubAuthAdapterAsync } from '@/features/github-auth/composition/createGitHubAuthAdapterAsync';

/*** Read only client-safe GitHub account presentation data from the request-scoped server session. */
export async function readGitHubAuthViewAsync(): Promise<GitHubAuthView> {
  const sessionId = (await cookies()).get(githubAuthCookieNames.session)?.value;
  if (sessionId === undefined) return { status: 'anonymous' };
  const auth = await createGitHubAuthAdapterAsync(sessionId);
  if (!auth.available) return { message: auth.message, status: 'unavailable' };
  const result = await auth.adapter.getSession();
  if (!result.ok || result.data === null || result.data === undefined)
    return { status: 'anonymous' };
  return {
    displayName: result.data.user.displayName ?? result.data.user.username ?? 'GitHub account',
    status: 'authenticated',
  };
}

/*** Resolve a GitHub credential exclusively from the current server session for repository operations. */
export async function readGitHubRepositoryAuthenticationAsync(): Promise<GitHubRepositoryAuthorization> {
  const sessionId = (await cookies()).get(githubAuthCookieNames.session)?.value;
  if (sessionId === undefined) return { authentication: 'anonymous', cacheScope: 'anonymous' };
  const auth = await createGitHubAuthAdapterAsync(sessionId);
  if (!auth.available) return { authentication: 'anonymous', cacheScope: 'anonymous' };
  const result = await auth.adapter.getSession();
  return result.ok && result.data !== null && result.data !== undefined
    ? {
        authentication: { kind: 'user', accessToken: result.data.accessToken },
        cacheScope: `github-user:${result.data.user.id}`,
      }
    : { authentication: 'anonymous', cacheScope: 'anonymous' };
}

export interface GitHubRepositoryAuthorization {
  readonly authentication: GitHubRepositoryAuthentication;
  readonly cacheScope: string;
}

export type GitHubAuthView =
  | { readonly status: 'anonymous' }
  | { readonly displayName: string; readonly status: 'authenticated' }
  | { readonly message: string; readonly status: 'unavailable' };
