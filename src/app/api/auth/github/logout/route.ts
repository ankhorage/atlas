import { createGitHubLogoutRoute } from '@/features/github-auth/adapters/inbound/next/createGitHubLogoutRoute';
import { readGitHubAuthSession } from '@/features/github-auth/adapters/inbound/next/githubAuthCookies';
import { createGitHubAuthAdapterAsync } from '@/features/github-auth/composition/createGitHubAuthAdapterAsync';

/*** Clear the server-side GitHub session through a same-origin sign-out request. */
export const POST = createGitHubLogoutRoute(async cookieHeader => {
  const session = readGitHubAuthSession(cookieHeader);
  if (session === undefined) return true;
  const auth = await createGitHubAuthAdapterAsync({ session });
  if (!auth.available) return false;
  return (await auth.adapter.signOut()).ok;
});
