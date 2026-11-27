'use client';
import { useState } from 'react';

import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

/*** Owns the mutable browser state of the source picker independently from inventory transport. */
export function useProjectSourceFormState(
  initialOwner: string,
  repositories: readonly WorkspaceRepositoryOption[] | undefined,
  activeWorkspaceId: string | undefined
) {
  const [source, setSource] = useState(initialOwner);
  const [selectedIds, setSelectedIds] = useState(createSelectedRepositoryIds(repositories));
  const [branchSelections, setBranchSelections] = useState<Readonly<Record<string, string>>>({});
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState(activeWorkspaceId);
  const [workspaceExclusions, setWorkspaceExclusions] = useState<ReadonlySet<string> | undefined>(
    undefined
  );
  return {
    activeId,
    branchSelections,
    search,
    selectedIds,
    setActiveId,
    setSearch,
    setSelectedIds,
    setBranchSelections,
    setSource,
    setWorkspaceExclusions,
    source,
    workspaceExclusions,
  };
}

/*** Initialize browser selection from the server-authorized discovery result. */
function createSelectedRepositoryIds(
  repositories: readonly WorkspaceRepositoryOption[] | undefined
): Set<string> {
  return new Set(
    repositories?.filter(repository => repository.selected).map(repository => repository.id)
  );
}
