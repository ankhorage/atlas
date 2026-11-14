'use client';
import { useEffect, useState } from 'react';

import { createBrowserWorkspaceSessionStore } from '@/features/workspace/adapters/outbound/browser/createBrowserWorkspaceSessionStore';
import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

/*** Restore first, then persist only the active owner and nonsecret repository identifiers. */
export function useBrowserWorkspaceSession(input: BrowserWorkspaceSessionInput): void {
  const { onRestoreSelection, selectedIds, setSelectedIds, setSource, source } = input;
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const session = createBrowserWorkspaceSessionStore(window.localStorage).load();
      if (session !== undefined) {
        setSource(session.source);
        const restoredSelectedIds = new Set(session.selectedRepositoryIds);
        setSelectedIds(restoredSelectedIds);
        onRestoreSelection({
          selectedIds: [...restoredSelectedIds].toSorted(),
          source: session.source,
        });
      }
      setHydrated(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [onRestoreSelection, setSelectedIds, setSource]);
  useEffect(() => {
    if (!hydrated) return;
    createBrowserWorkspaceSessionStore(window.localStorage).save({
      selectedRepositoryIds: [...selectedIds].toSorted(),
      source: source.trim(),
    });
  }, [hydrated, selectedIds, source]);
}

interface BrowserWorkspaceSessionInput {
  readonly onRestoreSelection: (detail: {
    readonly selectedIds: readonly string[];
    readonly source: string;
  }) => void;
  readonly selectedIds: ReadonlySet<string>;
  readonly setSelectedIds: (selectedIds: Set<string>) => void;
  readonly setSource: (source: string) => void;
  readonly source: string;
}

/*** Restore saved owner exclusions only after the current inventory is available to the picker. */
export function useSavedWorkspaceSelectionRestore(
  input: SavedWorkspaceSelectionRestoreInput
): void {
  useEffect(() => {
    const { exclusions } = input;
    if (
      exclusions === undefined ||
      input.repositories.some(repository => repository.owner !== input.source)
    )
      return;
    const selectedIds = new Set(
      input.repositories
        .filter(repository => !exclusions.has(repository.id))
        .map(repository => repository.id)
    );
    input.setSelectedIds(selectedIds);
    input.setExclusions(undefined);
    input.select(selectedIds, input.source);
  }, [input]);
}

interface SavedWorkspaceSelectionRestoreInput {
  readonly exclusions: ReadonlySet<string> | undefined;
  readonly repositories: readonly WorkspaceRepositoryOption[];
  readonly select: (selectedIds: Set<string>, source?: string) => void;
  readonly setExclusions: (selectedIds: ReadonlySet<string> | undefined) => void;
  readonly setSelectedIds: (selectedIds: Set<string>) => void;
  readonly source: string;
}
