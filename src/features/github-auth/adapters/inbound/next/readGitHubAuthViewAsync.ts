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

export type GitHubAuthView =
  | { readonly status: 'anonymous' }
  | { readonly displayName: string; readonly status: 'authenticated' }
  | { readonly message: string; readonly status: 'unavailable' };
