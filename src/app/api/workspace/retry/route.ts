import { readGitHubRepositoryAuthenticationAsync } from '@/features/github-auth/adapters/inbound/next/readGitHubAuthViewAsync';
import { createWorkspaceRetryRoute } from '@/features/workspace/adapters/inbound/next/createWorkspaceRetryRoute';
import { retryWorkspaceRepositoryAsync } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

/*** Bind the production retry route to the process-local workspace runtime. */
export const POST = createWorkspaceRetryRoute(async (runtimeId, repositoryId) => {
  const authorization = await readGitHubRepositoryAuthenticationAsync();
  return retryWorkspaceRepositoryAsync(runtimeId, repositoryId, {
    authentication: authorization.authentication,
    authorizationScope: authorization.cacheScope,
  });
});
