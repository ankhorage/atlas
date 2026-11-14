import { createGitHubLogoutRoute } from '@/features/github-auth/adapters/inbound/next/createGitHubLogoutRoute';
import { createGitHubAuthAdapterAsync } from '@/features/github-auth/composition/createGitHubAuthAdapterAsync';

/*** Clear the server-side GitHub session through a same-origin sign-out request. */
export const POST = createGitHubLogoutRoute(async sessionId => {
  const auth = await createGitHubAuthAdapterAsync(sessionId);
  if (!auth.available) return false;
  return (await auth.adapter.signOut()).ok;
});
