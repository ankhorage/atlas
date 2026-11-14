'use client';
import { useCallback, useEffect, useRef } from 'react';

import type { WorkspaceSelectionEventDetail } from '@/features/workspace/adapters/inbound/react/ProjectSourceForm';
import type { WorkspaceLoadResult, WorkspaceRepositoryLoadStatus } from '@/types/workspace';

/*** Applies the newest streamed repository-selection operation without replacing the graph runtime. */
export function useWorkspaceRepositorySelection(
  initialSource: string | undefined,
  initialSelectedIds: readonly string[],
  liveWorkspace: LiveWorkspace,
  setLiveWorkspace: (value: LiveWorkspace | ((current: LiveWorkspace) => LiveWorkspace)) => void
): (detail: WorkspaceSelectionEventDetail) => void {
  const operation = useWorkspaceSelectionOperation(
    initialSource,
    initialSelectedIds,
    liveWorkspace,
    setLiveWorkspace
  );
  return useCallback(detail => void operation.current(detail), [operation]);
}

/*** Owns request generation, cancellation, and the latest browser selection outside render closures. */
function useWorkspaceSelectionOperation(
  initialSource: string | undefined,
  initialSelectedIds: readonly string[],
  liveWorkspace: LiveWorkspace,
  setLiveWorkspace: (value: LiveWorkspace | ((current: LiveWorkspace) => LiveWorkspace)) => void
) {
  const state = useRef<WorkspaceSelectionState>({
    controller: undefined,
    generation: 0,
    selectedIds: new Set(initialSelectedIds),
    source: normalizeSource(initialSource),
    workspace: liveWorkspace,
  });
  useEffect(() => {
    state.current.workspace = liveWorkspace;
  }, [liveWorkspace]);
  useEffect(
    () => () => {
      state.current.controller?.abort();
    },
    []
  );
  return useRef((detail: WorkspaceSelectionEventDetail) =>
    runWorkspaceSelectionAsync(state.current, detail, setLiveWorkspace)
  );
}

/*** Start one generation and retain only its corresponding streamed workspace snapshots. */
async function runWorkspaceSelectionAsync(
  previous: WorkspaceSelectionState,
  detail: WorkspaceSelectionEventDetail,
  setLiveWorkspace: (value: LiveWorkspace | ((current: LiveWorkspace) => LiveWorkspace)) => void
): Promise<void> {
  const source = normalizeSource(detail.source);
  const selectedIds = new Set(detail.selectedIds);
  const sourceChanged = source !== previous.source;
  const addedRepositoryIds = sourceChanged
    ? [...selectedIds]
    : [...selectedIds].filter(id => !previous.selectedIds.has(id));
  const removedRepositoryIds = sourceChanged
    ? []
    : [...previous.selectedIds].filter(id => !selectedIds.has(id));
  if (addedRepositoryIds.length === 0 && removedRepositoryIds.length === 0) return;
  previous.controller?.abort();
  const controller = new AbortController();
  const generation = previous.generation + 1;
  const state = { ...previous, controller, generation, selectedIds, source };
  Object.assign(previous, state);
  if (sourceChanged && selectedIds.size === 0) {
    replaceWorkspaceHistory(source, selectedIds);
    return;
  }
  const runtimeId = sourceChanged ? undefined : previous.workspace.runtimeId;
  try {
    await streamWorkspaceSelectionAsync(
      { addedRepositoryIds, generation, removedRepositoryIds, runtimeId, source },
      controller.signal,
      frame => {
        if (controller.signal.aborted || previous.generation !== generation) return;
        setLiveWorkspace(current => {
          const next = preserveWorkspaceDuringRecovery(current, frame, runtimeId);
          previous.workspace = next;
          return next;
        });
      }
    );
    if (previous.generation === generation) replaceWorkspaceHistory(source, selectedIds);
  } catch (error) {
    if (controller.signal.aborted || previous.generation !== generation) return;
    if (isRuntimeGone(error)) {
      await recoverWorkspaceRuntimeAsync(previous, controller.signal, setLiveWorkspace);
      return;
    }
    setLiveWorkspace(current => ({ ...current, error: readSelectionError(error) }));
  }
}

/*** Starts a fresh runtime with the current complete selection after the server evicts an old one. */
async function recoverWorkspaceRuntimeAsync(
  state: WorkspaceSelectionState,
  signal: AbortSignal,
  setLiveWorkspace: (value: LiveWorkspace | ((current: LiveWorkspace) => LiveWorkspace)) => void
): Promise<void> {
  if (state.selectedIds.size === 0) return;
  const generation = state.generation + 1;
  state.generation = generation;
  try {
    await streamWorkspaceSelectionAsync(
      {
        addedRepositoryIds: [...state.selectedIds],
        generation,
        removedRepositoryIds: [],
        source: state.source,
      },
      signal,
      frame => {
        if (signal.aborted || state.generation !== generation) return;
        setLiveWorkspace(current => {
          const next = preserveWorkspaceDuringRecovery(current, frame, undefined);
          state.workspace = next;
          return next;
        });
      }
    );
    if (state.generation === generation) replaceWorkspaceHistory(state.source, state.selectedIds);
  } catch (error) {
    if (!signal.aborted)
      setLiveWorkspace(current => ({ ...current, error: readSelectionError(error) }));
  }
}

/*** Consume every complete NDJSON snapshot as it arrives instead of waiting for the terminal frame. */
async function streamWorkspaceSelectionAsync(
  request: WorkspaceSelectionRequest,
  signal: AbortSignal,
  onFrame: (frame: WorkspaceProgressFrame) => void
): Promise<void> {
  const response = await fetch('/api/workspace/selection', {
    body: JSON.stringify(request),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
    signal,
  });
  if (response.status === 410) throw new WorkspaceSelectionError('runtime-gone');
  if (!response.ok || response.body === null) throw new WorkspaceSelectionError('request-failed');
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let remainder = '';
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    const records = `${remainder}${chunk.value}`.split('\n');
    remainder = records.pop() ?? '';
    records.forEach(record => consumeWorkspaceProgressRecord(record, request.generation, onFrame));
  }
  consumeWorkspaceProgressRecord(remainder, request.generation, onFrame);
}

/*** Validate one NDJSON record before it can affect visible graph or status state. */
function consumeWorkspaceProgressRecord(
  record: string,
  generation: number,
  onFrame: (frame: WorkspaceProgressFrame) => void
): void {
  if (record.trim() === '') return;
  const value: unknown = JSON.parse(record);
  if (isTerminalErrorFrame(value, generation))
    throw new WorkspaceSelectionError('terminal-failure');
  if (isWorkspaceProgressFrame(value, generation)) onFrame(value);
}

/*** Retain the visible graph only while a recovered runtime has not produced usable topology. */
function preserveWorkspaceDuringRecovery(
  current: LiveWorkspace,
  frame: WorkspaceProgressFrame,
  previousRuntimeId: string | undefined
): LiveWorkspace {
  const workspace =
    previousRuntimeId === undefined && !frame.workspace.ok && current.workspace.ok
      ? current.workspace
      : frame.workspace;
  return {
    error: undefined,
    repositoryStatuses: frame.repositoryStatuses,
    runtimeId: frame.runtimeId,
    workspace,
  };
}

/*** Keep history in sync with an applied selection without causing a document navigation. */
function replaceWorkspaceHistory(source: string, selectedIds: ReadonlySet<string>): void {
  const url = new URL(window.location.href);
  if (source === '') url.searchParams.delete('source');
  else url.searchParams.set('source', source);
  if (selectedIds.size === 0) url.searchParams.delete('repositories');
  else url.searchParams.set('repositories', [...selectedIds].toSorted().join(','));
  window.history.replaceState(null, '', url);
}

/*** Normalize the owner identity to the same stable value used in the server runtime contract. */
function normalizeSource(source: string | undefined): string {
  return source?.split('|')[0]?.trim().toLowerCase() ?? '';
}

/*** Identify the documented recoverable runtime eviction response. */
function isRuntimeGone(error: unknown): boolean {
  return error instanceof WorkspaceSelectionError && error.kind === 'runtime-gone';
}

/*** Keep transport failures understandable without exposing untrusted server bodies. */
function readSelectionError(error: unknown): string {
  return error instanceof WorkspaceSelectionError && error.kind === 'terminal-failure'
    ? 'Workspace analysis stopped before it completed.'
    : 'Unable to update repository selection.';
}

/*** Narrow a credential-free progressive workspace snapshot from the server transport. */
function isWorkspaceProgressFrame(
  value: unknown,
  generation: number
): value is WorkspaceProgressFrame {
  return (
    typeof value === 'object' &&
    value !== null &&
    'generation' in value &&
    value.generation === generation &&
    'runtimeId' in value &&
    typeof value.runtimeId === 'string' &&
    'workspace' in value &&
    isWorkspaceLoadResult(value.workspace) &&
    'repositoryStatuses' in value &&
    Array.isArray(value.repositoryStatuses)
  );
}

/*** Distinguish a documented terminal stream failure from ordinary progress snapshots. */
function isTerminalErrorFrame(value: unknown, generation: number): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'generation' in value &&
    value.generation === generation &&
    'type' in value &&
    value.type === 'terminal-error'
  );
}

/*** Check only the portable workspace result discriminant at the transport boundary. */
function isWorkspaceLoadResult(value: unknown): value is WorkspaceLoadResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ok' in value &&
    typeof value.ok === 'boolean' &&
    (value.ok ? 'value' in value : 'error' in value)
  );
}

class WorkspaceSelectionError extends Error {
  public constructor(readonly kind: 'request-failed' | 'runtime-gone' | 'terminal-failure') {
    super(kind);
  }
}

interface WorkspaceSelectionRequest {
  readonly addedRepositoryIds: readonly string[];
  readonly generation: number;
  readonly removedRepositoryIds: readonly string[];
  readonly runtimeId?: string;
  readonly source: string;
}

interface WorkspaceProgressFrame {
  readonly generation: number;
  readonly repositoryStatuses: readonly WorkspaceRepositoryLoadStatus[];
  readonly runtimeId: string;
  readonly workspace: WorkspaceLoadResult;
}

interface WorkspaceSelectionState {
  controller: AbortController | undefined;
  generation: number;
  selectedIds: Set<string>;
  source: string;
  workspace: LiveWorkspace;
}

export interface LiveWorkspace {
  readonly error?: string;
  readonly repositoryStatuses: readonly WorkspaceRepositoryLoadStatus[] | undefined;
  readonly runtimeId: string | undefined;
  readonly workspace: WorkspaceLoadResult;
}
