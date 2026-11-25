import type { WorkspaceLoadResult, WorkspaceRepositoryLoadStatus } from '@/types/workspace';

export async function streamWorkspaceSelectionAsync(
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
    'projectName' in value &&
    typeof value.projectName === 'string' &&
    'workspace' in value &&
    isWorkspaceLoadResult(value.workspace) &&
    'repositoryStatuses' in value &&
    Array.isArray(value.repositoryStatuses)
  );
}

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

function isWorkspaceLoadResult(value: unknown): value is WorkspaceLoadResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ok' in value &&
    typeof value.ok === 'boolean' &&
    (value.ok ? 'value' in value : 'error' in value)
  );
}

export class WorkspaceSelectionError extends Error {
  public constructor(readonly kind: 'request-failed' | 'runtime-gone' | 'terminal-failure') {
    super(kind);
  }
}

export interface WorkspaceSelectionRequest {
  readonly addedRepositoryIds: readonly string[];
  readonly generation: number;
  readonly removedRepositoryIds: readonly string[];
  readonly runtimeId?: string;
  readonly source: string;
}

export interface WorkspaceProgressFrame {
  readonly generation: number;
  readonly projectName: string;
  readonly repositoryStatuses: readonly WorkspaceRepositoryLoadStatus[];
  readonly runtimeId: string;
  readonly workspace: WorkspaceLoadResult;
}
