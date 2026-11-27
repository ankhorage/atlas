'use client';
import { useSavedWorkspaceSelectionRestore } from '@/features/workspace/adapters/inbound/react/useBrowserWorkspaceSession';
import { useProjectSourceActions } from '@/features/workspace/adapters/inbound/react/useProjectSourceActions';
import type { useProjectSourceFormState } from '@/features/workspace/adapters/inbound/react/useProjectSourceFormState';
import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

/*** Combine source-form actions with restoration and nonsecret browser-session persistence. */
export function useProjectSourceFormActions(input: ProjectSourceFormActionsInput) {
  const actions = useProjectSourceActions({
    branchSelections: input.state.branchSelections,
    onSelection: input.onSelection,
    selectedRepositories: input.selectedRepositories,
    setActiveWorkspaceId: input.state.setActiveId,
    setSelectedIds: input.state.setSelectedIds,
    setBranchSelections: input.state.setBranchSelections,
    setSource: input.state.setSource,
    setWorkspaceExclusions: input.state.setWorkspaceExclusions,
    source: input.state.source,
  });
  useSavedWorkspaceSelectionRestore({
    exclusions: input.state.workspaceExclusions,
    inventoryLoaded: input.inventoryLoaded,
    inventoryOwner: input.inventoryOwner,
    repositories: input.repositories,
    selectionSupported: input.selectionSupported,
    select: actions.select,
    setExclusions: input.state.setWorkspaceExclusions,
    setSelectedIds: input.state.setSelectedIds,
    source: input.state.source,
  });
  return actions;
}

interface ProjectSourceFormActionsInput {
  readonly onSelection: (detail: {
    readonly branchSelections?: Readonly<Record<string, string>>;
    readonly selectedIds: readonly string[];
    readonly source: string;
  }) => void;
  readonly inventoryLoaded: boolean;
  readonly inventoryOwner: string | undefined;
  readonly repositories: readonly WorkspaceRepositoryOption[];
  readonly selectionSupported: boolean;
  readonly selectedRepositories: readonly WorkspaceRepositoryOption[];
  readonly state: ReturnType<typeof useProjectSourceFormState>;
}
