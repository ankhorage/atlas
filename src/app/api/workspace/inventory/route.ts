import { readGitHubRepositoryAuthenticationAsync } from '@/features/github-auth/adapters/inbound/next/readGitHubAuthViewAsync';
import { createWorkspaceInventoryRoute } from '@/features/workspace/adapters/inbound/next/createWorkspaceInventoryRoute';
import { discoverWorkspaceInventoryAsync } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

/*** Bind discovery-only inventory to current request credentials without exposing them to the browser. */
export const GET = createWorkspaceInventoryRoute(async source =>
  discoverWorkspaceInventoryAsync(
    source,
    toWorkspaceAuthorization(await readGitHubRepositoryAuthenticationAsync())
  )
);

/*** Translate the auth feature's request-scoped cache scope into the workspace runtime contract. */
function toWorkspaceAuthorization(
  authorization: Awaited<ReturnType<typeof readGitHubRepositoryAuthenticationAsync>>
) {
  return {
    authentication: authorization.authentication,
    authorizationScope: authorization.cacheScope,
  };
}
