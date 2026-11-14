import type { WorkspaceRepositoryRuntimeResult } from '@/features/workspace/composition/composeWorkspaceRepositoryRuntimeResult';

/*** Stream complete credential-free workspace snapshots over one request-scoped serverless response. */
export function createWorkspaceProgressResponse(
  generation: number,
  runAsync: (
    onProgress: (result: WorkspaceRepositoryRuntimeResult) => Promise<void>,
    signal: AbortSignal
  ) => Promise<WorkspaceRepositoryRuntimeResult>
): Response {
  const encoder = new TextEncoder();
  const abortController = new AbortController();
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  void writer.closed.catch(() => {
    abortController.abort(
      new DOMException('The workspace progress reader was cancelled.', 'AbortError')
    );
  });
  void streamWorkspaceProgressAsync(writer, encoder, generation, runAsync, abortController);
  return new Response(stream.readable, {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/x-ndjson; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  });
}

/*** Serialize progress in reader demand order and retain a credential-free terminal failure signal. */
async function streamWorkspaceProgressAsync(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
  generation: number,
  runAsync: Parameters<typeof createWorkspaceProgressResponse>[1],
  abortController: AbortController
): Promise<void> {
  const publish = (result: WorkspaceRepositoryRuntimeResult) =>
    writer.write(encoder.encode(`${JSON.stringify(toProgressFrame(result, generation))}\n`));
  try {
    await publish(await runAsync(publish, abortController.signal));
    await writer.close();
  } catch {
    if (abortController.signal.aborted) return;
    await writer.write(encoder.encode(`${JSON.stringify(toTerminalErrorFrame(generation))}\n`));
    await writer.close();
  }
}

/*** Keep every successful NDJSON record to the stable client contract and omit transport-internal fields. */
function toProgressFrame(result: WorkspaceRepositoryRuntimeResult, generation: number) {
  return {
    generation,
    repositoryStatuses: result.repositoryStatuses,
    runtimeId: result.runtimeId,
    workspace: result.workspace,
  };
}

/*** Report a bounded stream failure without exposing an upstream error, credential, or filesystem detail. */
function toTerminalErrorFrame(generation: number) {
  return {
    error: 'Workspace progress stream failed.',
    generation,
    type: 'terminal-error' as const,
  };
}
