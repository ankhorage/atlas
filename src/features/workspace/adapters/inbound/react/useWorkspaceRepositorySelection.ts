'use client';
/* eslint-disable max-lines */
import { useCallback, useEffect, useRef } from 'react';

import type { WorkspaceSelectionEventDetail } from '@/features/workspace/adapters/inbound/react/ProjectSourceForm';
import {
  streamWorkspaceSelectionAsync,
  type WorkspaceProgressFrame,
  WorkspaceSelectionError,
  type WorkspaceSelectionRequest,
} from '@/features/workspace/adapters/inbound/react/workspaceSelectionTransport';
import { isWorkspaceSelectionSource } from '@/features/workspace/application/use-cases/isWorkspaceSelectionSource';
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
    branchSelections: {},
    generation: 0,
    inFlight: false,
    pendingSelection: undefined,
    selectedIds: new Set(initialSelectedIds),
    source: normalizeSource(initialSource),
    timer: undefined,
    workspace: liveWorkspace,
  });
  useEffect(() => {
    state.current.workspace = liveWorkspace;
  }, [liveWorkspace]);
  useEffect(
    () => () => {
      if (state.current.timer !== undefined) window.clearTimeout(state.current.timer);
      state.current.controller?.abort();
    },
    []
  );
  return useRef((detail: WorkspaceSelectionEventDetail) =>
    scheduleWorkspaceSelection(state.current, detail, setLiveWorkspace)
  );
}

/*** Coalesce picker changes before opening a stream; later changes wait for the active stream. */
function scheduleWorkspaceSelection(
  state: WorkspaceSelectionState,
  detail: WorkspaceSelectionEventDetail,
  setLiveWorkspace: (value: LiveWorkspace | ((current: LiveWorkspace) => LiveWorkspace)) => void
): void {
  if (detail.selectedIds.length === 0) {
    clearScheduledWorkspaceSelection(state, detail, setLiveWorkspace);
    return;
  }
  state.pendingSelection = detail;
  if (state.timer !== undefined) window.clearTimeout(state.timer);
  state.timer = window.setTimeout(() => {
    state.timer = undefined;
    void flushWorkspaceSelectionAsync(state, setLiveWorkspace);
  }, SELECTION_DEBOUNCE_MS);
}

function clearScheduledWorkspaceSelection(
  state: WorkspaceSelectionState,
  detail: WorkspaceSelectionEventDetail,
  setLiveWorkspace: (value: LiveWorkspace | ((current: LiveWorkspace) => LiveWorkspace)) => void
): void {
  const source = normalizeSource(detail.source);
  if (!isWorkspaceSelectionSource(source)) return;
  if (state.timer !== undefined) window.clearTimeout(state.timer);
  state.timer = undefined;
  state.controller?.abort();
  state.controller = undefined;
  state.generation += 1;
  state.pendingSelection = undefined;
  state.selectedIds = new Set();
  state.source = source;
  clearWorkspaceSelection(state, setLiveWorkspace);
  replaceWorkspaceHistory(source, state.selectedIds);
}

/*** Serialize selection streams so a diff always targets the runtime that produced it. */
async function flushWorkspaceSelectionAsync(
  state: WorkspaceSelectionState,
  setLiveWorkspace: (value: LiveWorkspace | ((current: LiveWorkspace) => LiveWorkspace)) => void
): Promise<void> {
  if (state.inFlight || state.pendingSelection === undefined) return;
  const detail = state.pendingSelection;
  state.pendingSelection = undefined;
  state.inFlight = true;
  try {
    await runWorkspaceSelectionAsync(state, detail, setLiveWorkspace);
  } finally {
    state.inFlight = false;
    state.controller = undefined;
    flushPendingWorkspaceSelection(state, setLiveWorkspace);
  }
}

function flushPendingWorkspaceSelection(
  state: WorkspaceSelectionState,
  setLiveWorkspace: (value: LiveWorkspace | ((current: LiveWorkspace) => LiveWorkspace)) => void
): void {
  if (state.pendingSelection !== undefined)
    void flushWorkspaceSelectionAsync(state, setLiveWorkspace);
}

/*** Apply one settled picker intent without superseding an already-running server operation. */
async function runWorkspaceSelectionAsync(
  previous: WorkspaceSelectionState,
  detail: WorkspaceSelectionEventDetail,
  setLiveWorkspace: (value: LiveWorkspace | ((current: LiveWorkspace) => LiveWorkspace)) => void
): Promise<void> {
  const change = createWorkspaceSelectionChange(previous, detail);
  if (change === null) return;
  const { branchSelections, selectedIds, source, sourceChanged } = change;
  const controller = new AbortController();
  const generation = previous.generation + 1;
  const state = { ...previous, branchSelections, controller, generation, selectedIds, source };
  Object.assign(previous, state);
  if (selectedIds.size === 0) return clearEmptyWorkspaceSelection(previous, setLiveWorkspace);
  const runtimeId = sourceChanged ? undefined : previous.workspace.runtimeId;
  try {
    await streamWorkspaceSelectionAsync(
      createSelectionRequest(
        {
          addedRepositoryIds: change.addedRepositoryIds,
          branchSelections,
          generation,
          removedRepositoryIds: change.removedRepositoryIds,
          runtimeId,
          source,
        },
        selectedIds,
        change.requiresInitialLoad
      ),
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
    if (previous.generation === generation && previous.pendingSelection === undefined)
      replaceWorkspaceHistory(source, selectedIds);
  } catch (error) {
    if (controller.signal.aborted || previous.generation !== generation) return;
    if (isRuntimeGone(error)) {
      await recoverWorkspaceRuntimeAsync(previous, controller.signal, setLiveWorkspace);
      return;
    }
    setLiveWorkspace(current => ({ ...current, error: readSelectionError(error) }));
  }
}

function clearEmptyWorkspaceSelection(
  state: WorkspaceSelectionState,
  setLiveWorkspace: (value: LiveWorkspace | ((current: LiveWorkspace) => LiveWorkspace)) => void
): void {
  clearWorkspaceSelection(state, setLiveWorkspace);
  replaceWorkspaceHistory(state.source, state.selectedIds);
}

function createWorkspaceSelectionChange(
  previous: WorkspaceSelectionState,
  detail: WorkspaceSelectionEventDetail
): WorkspaceSelectionChange | null {
  const source = normalizeSource(detail.source);
  if (!isWorkspaceSelectionSource(source)) return null;
  const selectedIds = new Set(detail.selectedIds);
  const branchSelections = detail.branchSelections ?? {};
  const previousBranches = new Map(Object.entries(previous.branchSelections));
  const branches = new Map(Object.entries(branchSelections));
  const sourceChanged = source !== previous.source;
  const addedRepositoryIds = sourceChanged
    ? [...selectedIds]
    : [...selectedIds].filter(
        id => !previous.selectedIds.has(id) || previousBranches.get(id) !== branches.get(id)
      );
  const removedRepositoryIds = sourceChanged
    ? []
    : [...previous.selectedIds].filter(id => !selectedIds.has(id));
  const requiresInitialLoad = needsInitialLoad(previous);
  if (addedRepositoryIds.length === 0 && removedRepositoryIds.length === 0 && !requiresInitialLoad)
    return null;
  return {
    addedRepositoryIds,
    branchSelections,
    removedRepositoryIds,
    requiresInitialLoad,
    selectedIds,
    source,
    sourceChanged,
  };
}

function needsInitialLoad(state: WorkspaceSelectionState): boolean {
  return state.workspace.runtimeId === undefined && state.workspace.selectionRequired === true;
}

function createSelectionRequest(
  request: WorkspaceSelectionRequest,
  selectedIds: ReadonlySet<string>,
  requiresInitialLoad: boolean
): WorkspaceSelectionRequest {
  return requiresInitialLoad ? { ...request, addedRepositoryIds: [...selectedIds] } : request;
}

/*** Clear the browser-owned selection locally so expired runtimes cannot block an empty selection. */
function clearWorkspaceSelection(
  state: WorkspaceSelectionState,
  setLiveWorkspace: (value: LiveWorkspace | ((current: LiveWorkspace) => LiveWorkspace)) => void
): void {
  setLiveWorkspace(current => {
    const next = {
      ...current,
      error: undefined,
      repositoryStatuses: [],
      runtimeId: undefined,
      selectionRequired: true,
    };
    state.workspace = next;
    return next;
  });
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
        branchSelections: state.branchSelections,
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
    if (state.generation === generation && state.pendingSelection === undefined)
      replaceWorkspaceHistory(state.source, state.selectedIds);
  } catch (error) {
    if (!signal.aborted)
      setLiveWorkspace(current => ({ ...current, error: readSelectionError(error) }));
  }
}

/*** Retain the visible graph only while a recovered runtime has not produced usable topology. */
function preserveWorkspaceDuringRecovery(
  current: LiveWorkspace,
  frame: WorkspaceProgressFrame,
  previousRuntimeId: string | undefined
): LiveWorkspace {
  const cacheRefreshPending =
    current.preserveCachedGraph === true &&
    frame.repositoryStatuses.some(status => status.status === 'loading');
  const workspace =
    (cacheRefreshPending || previousRuntimeId === undefined) && current.workspace.ok
      ? current.workspace
      : frame.workspace;
  return {
    error: undefined,
    preserveCachedGraph: cacheRefreshPending,
    projectName: frame.projectName,
    repositoryStatuses: frame.repositoryStatuses,
    runtimeId: frame.runtimeId,
    selectionRequired: false,
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

interface WorkspaceSelectionState {
  branchSelections: Readonly<Record<string, string>>;
  controller: AbortController | undefined;
  generation: number;
  inFlight: boolean;
  pendingSelection: WorkspaceSelectionEventDetail | undefined;
  selectedIds: Set<string>;
  source: string;
  timer: ReturnType<typeof window.setTimeout> | undefined;
  workspace: LiveWorkspace;
}

interface WorkspaceSelectionChange {
  readonly addedRepositoryIds: readonly string[];
  readonly branchSelections: Readonly<Record<string, string>>;
  readonly removedRepositoryIds: readonly string[];
  readonly requiresInitialLoad: boolean;
  readonly selectedIds: Set<string>;
  readonly source: string;
  readonly sourceChanged: boolean;
}

const SELECTION_DEBOUNCE_MS = 180;

export interface LiveWorkspace {
  readonly error?: string;
  /** Retain the local snapshot while its first server refresh is still incomplete. */
  readonly preserveCachedGraph?: boolean;
  readonly projectName: string;
  readonly repositoryStatuses: readonly WorkspaceRepositoryLoadStatus[] | undefined;
  readonly runtimeId: string | undefined;
  readonly selectionRequired?: boolean;
  readonly workspace: WorkspaceLoadResult;
}
