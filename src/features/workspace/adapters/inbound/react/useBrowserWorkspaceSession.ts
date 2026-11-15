'use client';
import { useEffect, useState } from 'react';

import { createBrowserWorkspaceSessionStore } from '@/features/workspace/adapters/outbound/browser/createBrowserWorkspaceSessionStore';
import { isWorkspaceSelectionSource } from '@/features/workspace/application/use-cases/isWorkspaceSelectionSource';
import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

/*** Restore first, then persist only the active owner and nonsecret repository identifiers. */
export function useBrowserWorkspaceSession(input: BrowserWorkspaceSessionInput): void {
  const { onRestoreSelection, selectedIds, setSelectedIds, setSource, source } = input;
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const session = createBrowserWorkspaceSessionStore(window.localStorage).load();
      if (session !== undefined && consumeWorkspaceAuthRedirectRestore()) {
        setSource(session.source);
        const restoredSelectedIds = new Set(session.selectedRepositoryIds);
        setSelectedIds(restoredSelectedIds);
        if (isWorkspaceSelectionSource(session.source.trim().toLowerCase()))
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
  useEffect(() => {
    const markAuthRedirect = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const path = new URL(form.action, window.location.href).pathname;
      if (path !== '/api/auth/github/login' && path !== '/api/auth/github/logout') return;
      createBrowserWorkspaceSessionStore(window.localStorage).save({
        selectedRepositoryIds: [...selectedIds].toSorted(),
        source: source.trim(),
      });
      window.sessionStorage.setItem(WORKSPACE_AUTH_REDIRECT_STORAGE_KEY, '1');
    };
    document.addEventListener('submit', markAuthRedirect);
    return () => document.removeEventListener('submit', markAuthRedirect);
  }, [selectedIds, source]);
}

/*** Consume the one-shot browser marker so ordinary page visits never replay prior selections. */
function consumeWorkspaceAuthRedirectRestore(): boolean {
  if (window.sessionStorage.getItem(WORKSPACE_AUTH_REDIRECT_STORAGE_KEY) !== '1') return false;
  window.sessionStorage.removeItem(WORKSPACE_AUTH_REDIRECT_STORAGE_KEY);
  return true;
}

const WORKSPACE_AUTH_REDIRECT_STORAGE_KEY = 'atlas.workspace-auth-redirect.v1';

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
      !input.selectionSupported ||
      !input.inventoryLoaded ||
      input.inventoryOwner !== input.source.trim().toLowerCase()
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
  readonly inventoryLoaded: boolean;
  readonly inventoryOwner: string | undefined;
  readonly repositories: readonly WorkspaceRepositoryOption[];
  readonly selectionSupported: boolean;
  readonly select: (selectedIds: Set<string>, source?: string) => void;
  readonly setExclusions: (selectedIds: ReadonlySet<string> | undefined) => void;
  readonly setSelectedIds: (selectedIds: Set<string>) => void;
  readonly source: string;
}
