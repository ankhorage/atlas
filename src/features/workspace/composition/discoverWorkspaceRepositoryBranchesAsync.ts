import { discoverGitHubRepositoryBranchesAsync } from '@ankhorage/repository/github';

import { discoverWorkspaceGitHubSourcesAsync } from '@/features/project-source/composition/discoverWorkspaceGitHubSourcesAsync';
import {
  type WorkspaceRepositoryAuthorization,
  WorkspaceRepositoryRuntimeError,
} from '@/features/workspace/composition/createWorkspaceRepositoryRuntime';

/*** Discover branches only for a repository still authorized by the current workspace source. */
export async function discoverWorkspaceRepositoryBranchesAsync(
  source: string,
  repositoryId: string,
  authorization: WorkspaceRepositoryAuthorization
) {
  const discovery = await discoverWorkspaceGitHubSourcesAsync(
    source,
    new Set(),
    undefined,
    authorization.authentication
  );
  const repository = discovery.repositories.find(candidate => candidate.id === repositoryId);
  if (repository === undefined)
    throw new WorkspaceRepositoryRuntimeError(
      'invalid',
      'The requested repository is unavailable for this source and account.'
    );
  return discoverGitHubRepositoryBranchesAsync({
    authentication: authorization.authentication,
    url: repository.url,
  });
}
