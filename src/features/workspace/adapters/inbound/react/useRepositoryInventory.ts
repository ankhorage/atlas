import { useEffect, useState } from 'react';

import {
  isWorkspaceSelectionSource,
  normalizeWorkspaceSelectionSource,
} from '@/features/workspace/application/use-cases/isWorkspaceSelectionSource';
import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

/*** Fetches only a replacement picker inventory after an owner edit. */
export function useRepositoryInventory(
  initialOwner: string,
  initialRepositories: readonly WorkspaceRepositoryOption[] | undefined,
  source: string
) {
  const [repositories, setRepositories] = useState(initialRepositories ?? []);
  const initialInventoryOwner = normalizeWorkspaceSelectionSource(initialOwner.trim());
  const [loadedOwner, setLoadedOwner] = useState(initialInventoryOwner);
  const [inventoryError, setInventoryError] = useState<string | undefined>(undefined);
  const owner = normalizeWorkspaceSelectionSource(source.trim());
  const selectionSupported = isWorkspaceSelectionSource(owner);
  const initialInventory = owner === initialInventoryOwner;
  useEffect(() => {
    if (!selectionSupported || initialInventory) return;
    const controller = new AbortController();
    void loadRepositoryInventoryAsync(owner, controller.signal)
      .then(inventory => {
        if (controller.signal.aborted) return;
        setInventoryError(undefined);
        setLoadedOwner(owner);
        setRepositories(inventory);
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setInventoryError(error instanceof Error ? error.message : 'Unable to load repositories.');
      });
    return () => {
      controller.abort();
    };
  }, [initialInventory, owner, selectionSupported]);
  const inventoryLoaded = selectionSupported && (initialInventory || loadedOwner === owner);
  return {
    inventoryError: !selectionSupported || initialInventory ? undefined : inventoryError,
    inventoryLoaded,
    inventoryOwner: inventoryLoaded ? owner : undefined,
    repositories: initialInventory
      ? (initialRepositories ?? [])
      : inventoryLoaded
        ? repositories
        : [],
    selectionSupported,
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
