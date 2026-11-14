import { useRef } from 'react';

import type { WorkspaceSelectionEventDetail } from '@/features/workspace/adapters/inbound/react/ProjectSourceForm';
import type { WorkspaceLoadResult, WorkspaceRepositoryLoadStatus } from '@/types/workspace';

/*** Applies only the newest asynchronous repository selection response to the visible workspace. */
export function useWorkspaceRepositorySelection(
  liveWorkspace: LiveWorkspace,
  setLiveWorkspace: (value: LiveWorkspace) => void
): (detail: WorkspaceSelectionEventDetail) => void {
  const latest = useRef(0);
  const abort = useRef<AbortController | undefined>(undefined);
  return detail => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const requestId = ++latest.current;
    void updateWorkspaceSelectionAsync(
      liveWorkspace.runtimeId,
      detail.source,
      detail.selectedIds,
      controller.signal
    )
      .then(result => {
        if (requestId !== latest.current) return;
        setLiveWorkspace(result);
        replaceWorkspaceHistory(detail);
      })
      .catch(() => undefined);
  };
}

/*** Updates browser history without initiating document navigation or losing the graph instance. */
function replaceWorkspaceHistory(detail: WorkspaceSelectionEventDetail): void {
  const url = new URL(window.location.href);
  if (detail.source === '') url.searchParams.delete('source');
  else url.searchParams.set('source', detail.source);
  url.searchParams.set('repositories', detail.selectedIds.join(','));
  window.history.replaceState(null, '', url);
}

/*** Requests one server-owned incremental selection update through the explicit async boundary. */
async function updateWorkspaceSelectionAsync(
  runtimeId: string | undefined,
  source: string,
  selectedIds: readonly string[],
  signal: AbortSignal
): Promise<LiveWorkspace> {
  const response = await fetch(
    runtimeId === undefined ? '/api/workspace/open' : '/api/workspace/selection',
    {
      body: JSON.stringify(
        runtimeId === undefined
          ? { selectedRepositoryIds: selectedIds, source }
          : { runtimeId, selectedRepositoryIds: selectedIds }
      ),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      signal,
    }
  );
  if (!response.ok) throw new Error('Unable to update repository selection.');
  const result: unknown = await response.json();
  if (!isWorkspaceSelectionResult(result)) throw new Error('The selection response was invalid.');
  return {
    repositoryStatuses: result.repositoryStatuses,
    runtimeId: result.runtimeId,
    workspace: result.workspace,
  };
}

/*** Narrow selection response values before they replace the active workspace state. */
function isWorkspaceSelectionResult(
  value: unknown
): value is LiveWorkspace & { readonly runtimeId: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'runtimeId' in value &&
    typeof value.runtimeId === 'string' &&
    'workspace' in value &&
    'repositoryStatuses' in value &&
    Array.isArray(value.repositoryStatuses)
  );
}

export interface LiveWorkspace {
  readonly repositoryStatuses: readonly WorkspaceRepositoryLoadStatus[] | undefined;
  readonly runtimeId: string | undefined;
  readonly workspace: WorkspaceLoadResult;
}
