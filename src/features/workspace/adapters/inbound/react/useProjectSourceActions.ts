'use client';
import type { WorkspaceOpenDetail } from '@/features/workspace/adapters/inbound/react/workspaceControlTypes';
import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

/*** Creates source-form actions that keep browser navigation local to the live workspace. */
export function useProjectSourceActions(input: ProjectSourceActionsInput) {
  const select = (ids: Set<string>, selectionSource = input.source) => {
    input.setSelectedIds(ids);
    input.onSelection({ selectedIds: [...ids].toSorted(), source: selectionSource.trim() });
  };
  return {
    copyRepositoryLinks: () =>
      void navigator.clipboard.writeText(
        input.selectedRepositories.map(repository => repository.url).join('\n')
      ),
    deleteWorkspace: () => input.setActiveWorkspaceId(undefined),
    openWorkspace: (detail: WorkspaceOpenDetail) => {
      input.setActiveWorkspaceId(detail.id);
      input.setSource(detail.source);
      input.setWorkspaceExclusions(new Set(detail.excludedRepositoryIds));
      window.history.pushState(null, '', detail.href);
    },
    select,
    setSelectedIds: (ids: Set<string>) => select(ids),
    setSource: (value: string) => {
      input.setSource(value);
      if (value.trim() !== input.source.trim()) input.setSelectedIds(new Set());
    },
  };
}

interface ProjectSourceActionsInput {
  readonly onSelection: (detail: {
    readonly selectedIds: readonly string[];
    readonly source: string;
  }) => void;
  readonly selectedRepositories: readonly WorkspaceRepositoryOption[];
  readonly setActiveWorkspaceId: (id: string | undefined) => void;
  readonly setSelectedIds: (ids: Set<string>) => void;
  readonly setSource: (source: string) => void;
  readonly setWorkspaceExclusions: (ids: ReadonlySet<string> | undefined) => void;
  readonly source: string;
}
