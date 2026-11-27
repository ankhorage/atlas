import { readGitHubRepositoryAuthenticationAsync } from '@/features/github-auth/adapters/inbound/next/readGitHubAuthViewAsync';
import { createWorkspaceBranchesRoute } from '@/features/workspace/adapters/inbound/next/createWorkspaceBranchesRoute';
import { discoverWorkspaceRepositoryBranchesAsync } from '@/features/workspace/composition/discoverWorkspaceRepositoryBranchesAsync';

/** Bind lazy branch discovery to the current request-scoped GitHub authorization. */
export const GET = createWorkspaceBranchesRoute(async (source, repositoryId) => {
  const authorization = await readGitHubRepositoryAuthenticationAsync();
  return discoverWorkspaceRepositoryBranchesAsync(source, repositoryId, {
    authentication: authorization.authentication,
    authorizationScope: authorization.cacheScope,
  });
});
