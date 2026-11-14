import type { GitHubRepositoryAuthentication } from '@ankhorage/repository/github';
import { cookies } from 'next/headers';

import { readGitHubAuthSession } from '@/features/github-auth/adapters/inbound/next/githubAuthCookies';
import { createGitHubAuthAdapterAsync } from '@/features/github-auth/composition/createGitHubAuthAdapterAsync';

/*** Read only client-safe GitHub account presentation data from the request-scoped server session. */
export async function readGitHubAuthViewAsync(): Promise<GitHubAuthView> {
  const session = readGitHubAuthSession((await cookies()).toString());
  if (session === undefined) return { status: 'anonymous' };
  const auth = await createGitHubAuthAdapterAsync({ session });
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
  const session = readGitHubAuthSession((await cookies()).toString());
  if (session === undefined) return { authentication: 'anonymous', cacheScope: 'anonymous' };
  const auth = await createGitHubAuthAdapterAsync({ session });
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
