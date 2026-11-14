import { useEffect, useState } from 'react';

import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

/*** Fetches only a replacement picker inventory after a debounced owner edit. */
export function useRepositoryInventory(
  initialOwner: string,
  initialRepositories: readonly WorkspaceRepositoryOption[] | undefined,
  source: string
) {
  const [repositories, setRepositories] = useState(initialRepositories ?? []);
  const [inventoryError, setInventoryError] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (source.trim() === '' || source.trim() === initialOwner) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadRepositoryInventoryAsync(source.trim(), controller.signal)
        .then(inventory => {
          setInventoryError(undefined);
          setRepositories(inventory);
        })
        .catch(error => {
          if (controller.signal.aborted) return;
          setInventoryError(
            error instanceof Error ? error.message : 'Unable to load repositories.'
          );
        });
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [initialOwner, source]);
  return { inventoryError, repositories };
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
