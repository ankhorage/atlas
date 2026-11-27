import type { GitHubRepositoryDiscoveryRepository } from '@ankhorage/repository/github';

import { WorkspaceRepositoryRuntimeError } from '@/features/workspace/composition/createWorkspaceRepositoryRuntime';

/*** Resolve opaque selected IDs from current inventory and attach a requested branch URL. */
export function selectWorkspaceInventoryRepositories(
  inventory: readonly GitHubRepositoryDiscoveryRepository[],
  ids: readonly string[],
  branches: Readonly<Record<string, string>> | undefined
): readonly GitHubRepositoryDiscoveryRepository[] {
  const byId = new Map(inventory.map(repository => [repository.id, repository]));
  const branchByRepository = new Map(Object.entries(branches ?? {}));
  if (ids.some(id => !byId.has(id)))
    throw new WorkspaceRepositoryRuntimeError(
      'invalid',
      'A selected repository is unavailable for this source and account.'
    );
  return ids.flatMap(id => {
    const repository = byId.get(id);
    const branch = branchByRepository.get(id);
    return repository === undefined
      ? []
      : [
          branch === undefined
            ? repository
            : { ...repository, url: branchUrl(repository.url, branch) },
        ];
  });
}

/*** Encode a slash-containing branch through GitHub's canonical tree URL syntax. */
function branchUrl(url: string, branch: string): string {
  return `${url}/tree/${branch.split('/').map(encodeURIComponent).join('/')}`;
}
