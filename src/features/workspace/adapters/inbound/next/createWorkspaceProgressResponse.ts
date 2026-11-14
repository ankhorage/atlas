import type { WorkspaceRepositoryRuntimeResult } from '@/features/workspace/composition/composeWorkspaceRepositoryRuntimeResult';

/*** Stream complete credential-free workspace snapshots over one request-scoped serverless response. */
export function createWorkspaceProgressResponse(
  runAsync: (
    onProgress: (result: WorkspaceRepositoryRuntimeResult) => Promise<void>
  ) => Promise<WorkspaceRepositoryRuntimeResult>
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const publish = (result: WorkspaceRepositoryRuntimeResult) => {
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'workspace', result })}\n`));
        return Promise.resolve();
      };
      try {
        await publish(await runAsync(publish));
        controller.close();
      } catch {
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({ error: 'Unable to load workspace progress.', type: 'error' })}\n`
          )
        );
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
