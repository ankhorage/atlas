import type { GitHubRepositoryDiscoveryRepository } from '@ankhorage/repository/github';

import {
  classifyWorkspaceRepositoryFailure,
  workspaceRepositoryFailureDescription,
} from '@/features/workspace/application/use-cases/classifyWorkspaceRepositoryFailure';
import type { WorkspaceRepositoryLoadStatus } from '@/types/workspace';

/*** Build a credential-free runtime status record for one repository operation. */
export function createWorkspaceRepositoryStatus(
  repository: GitHubRepositoryDiscoveryRepository,
  status: WorkspaceRepositoryLoadStatus['status'],
  error?: unknown
): WorkspaceRepositoryLoadStatus {
  const failure =
    status === 'successful' || status === 'loading'
      ? undefined
      : classifyWorkspaceRepositoryFailure(error);
  return {
    repository: { id: repository.id, name: repository.name, owner: repository.owner },
    status,
    ...(failure === undefined
      ? {}
      : { description: workspaceRepositoryFailureDescription(failure), failure }),
  };
}
