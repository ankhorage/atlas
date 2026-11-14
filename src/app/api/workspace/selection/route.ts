import { readGitHubRepositoryAuthenticationAsync } from '@/features/github-auth/adapters/inbound/next/readGitHubAuthViewAsync';
import { createWorkspaceSelectionRoute } from '@/features/workspace/adapters/inbound/next/createWorkspaceSelectionRoute';
import { createWorkspaceSelectionOperationAsync } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

/*** Bind selection streaming to current request credentials and never persist the resolved GitHub token. */
export const POST = createWorkspaceSelectionRoute(async (input, request) =>
  createWorkspaceSelectionOperationAsync(
    input,
    toWorkspaceAuthorization(await readGitHubRepositoryAuthenticationAsync()),
    request.signal
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
