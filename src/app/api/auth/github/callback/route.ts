import { createGitHubCallbackRoute } from '@/features/github-auth/adapters/inbound/next/createGitHubCallbackRoute';
import { createGitHubAuthAdapterAsync } from '@/features/github-auth/composition/createGitHubAuthAdapterAsync';

/*** Complete the exact registered GitHub callback with a one-use, browser-bound OAuth attempt. */
export const GET = createGitHubCallbackRoute(async (attempt, requestUrl) => {
  const auth = await createGitHubAuthAdapterAsync({ authorizationAttempt: attempt });
  if (!auth.available) return { outcome: 'unavailable' };
  const result = await auth.adapter.completeAuthorization({
    attemptId: attempt.attemptId,
    response: { type: 'callback', url: requestUrl },
  });
  return result.ok
    ? { outcome: 'authenticated', session: result.session }
    : { outcome: result.status === 'cancelled' ? 'cancelled' : 'failed' };
});
