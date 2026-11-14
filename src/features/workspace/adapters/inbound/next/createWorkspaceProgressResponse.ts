import type { WorkspaceRepositoryRuntimeResult } from '@/features/workspace/composition/composeWorkspaceRepositoryRuntimeResult';

/*** Stream complete credential-free workspace snapshots over one request-scoped serverless response. */
export function createWorkspaceProgressResponse(
  generation: number,
  runAsync: (
    onProgress: (result: WorkspaceRepositoryRuntimeResult) => Promise<void>
  ) => Promise<WorkspaceRepositoryRuntimeResult>
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const publish = (result: WorkspaceRepositoryRuntimeResult) => {
        controller.enqueue(
          encoder.encode(`${JSON.stringify(toProgressFrame(result, generation))}\n`)
        );
        return Promise.resolve();
      };
      try {
        await publish(await runAsync(publish));
        controller.close();
      } catch {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/x-ndjson; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  });
}

/*** Keep every NDJSON record to the stable client contract and omit transport-internal presentation fields. */
function toProgressFrame(result: WorkspaceRepositoryRuntimeResult, generation: number) {
  return {
    generation,
    repositoryStatuses: result.repositoryStatuses,
    runtimeId: result.runtimeId,
    workspace: result.workspace,
  };
}
