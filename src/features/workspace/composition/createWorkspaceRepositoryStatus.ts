import type { GitHubRepositoryDiscoveryRepository } from '@ankhorage/repository/github';

import type { WorkspaceRepositoryLoadStatus } from '@/types/workspace';

/*** Build a credential-free runtime status record for one repository operation. */
export function createWorkspaceRepositoryStatus(
  repository: GitHubRepositoryDiscoveryRepository,
  status: WorkspaceRepositoryLoadStatus['status']
): WorkspaceRepositoryLoadStatus {
  return {
    repository: { id: repository.id, name: repository.name, owner: repository.owner },
    status,
    ...(status === 'successful'
      ? {}
      : {
          description:
            status === 'cancelled'
              ? 'Loading was cancelled.'
              : 'Repository materialization failed.',
        }),
  };
}
