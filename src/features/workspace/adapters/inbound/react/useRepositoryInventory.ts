import { useEffect, useState } from 'react';

import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

/*** Fetches only a replacement picker inventory after an owner edit. */
export function useRepositoryInventory(
  initialOwner: string,
  initialRepositories: readonly WorkspaceRepositoryOption[] | undefined,
  source: string
) {
  const [repositories, setRepositories] = useState(initialRepositories ?? []);
  const [inventoryError, setInventoryError] = useState<string | undefined>(undefined);
  const owner = source.trim();
  useEffect(() => {
    if (owner === '' || owner === initialOwner) return;
    const controller = new AbortController();
    void loadRepositoryInventoryAsync(owner, controller.signal)
      .then(inventory => {
        setInventoryError(undefined);
        setRepositories(inventory);
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setInventoryError(error instanceof Error ? error.message : 'Unable to load repositories.');
      });
    return () => {
      controller.abort();
    };
  }, [initialOwner, owner]);
  return {
    inventoryError: owner === '' || owner === initialOwner ? undefined : inventoryError,
    repositories:
      owner === '' || owner === initialOwner ? (initialRepositories ?? []) : repositories,
  };
}

/*** Loads only the repository picker inventory for an edited owner. */
async function loadRepositoryInventoryAsync(
  owner: string,
  signal: AbortSignal
): Promise<readonly WorkspaceRepositoryOption[]> {
  const response = await fetch(`/api/workspace/inventory?${new URLSearchParams({ owner })}`, {
    signal,
  });
  if (!response.ok) throw new Error('Unable to load repositories.');
  const value: unknown = await response.json();
  if (!isRepositoryInventory(value)) throw new Error('The repository inventory was invalid.');
  return value.repositories;
}

/*** Narrows the untrusted inventory response before it reaches the repository picker. */
function isRepositoryInventory(
  value: unknown
): value is { readonly repositories: readonly WorkspaceRepositoryOption[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'repositories' in value &&
    Array.isArray(value.repositories)
  );
}
