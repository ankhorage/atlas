import { isRecord } from '@ankhorage/utility/object';

import { WorkspaceRepositoryRuntimeError } from '@/features/workspace/composition/createWorkspaceRepositoryRuntime';

/*** Create the HTTP boundary that validates and retries one retained workspace repository. */
export function createWorkspaceRetryRoute(retryAsync: WorkspaceRepositoryRetryAsync) {
  return async function POST(request: Request): Promise<Response> {
    try {
      const body: unknown = await request.json();
      if (!isRetryRequest(body))
        return Response.json({ error: 'Invalid workspace retry request.' }, { status: 400 });
      return Response.json(await retryAsync(body.runtimeId, body.repositoryId));
    } catch (error) {
      return retryFailureResponse(error);
    }
  };
}

/*** Accept only opaque runtime and repository identifiers; source URLs and paths never cross this boundary. */
function isRetryRequest(
  value: unknown
): value is { readonly repositoryId: string; readonly runtimeId: string } {
  return (
    isRecord(value) && isOpaqueIdentifier(value.runtimeId) && isOpaqueIdentifier(value.repositoryId)
  );
}

/*** Reject empty or unbounded inputs before they reach process-local workspace state. */
function isOpaqueIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}

/*** Translate trusted runtime failure classes without returning internal errors or paths to the browser. */
function retryFailureResponse(error: unknown): Response {
  if (!(error instanceof WorkspaceRepositoryRuntimeError))
    return Response.json({ error: 'Unable to retry repository.' }, { status: 500 });
  const status =
    error.kind === 'invalid'
      ? 400
      : error.kind === 'unavailable'
        ? 410
        : error.kind === 'rate-limited'
          ? 429
          : 409;
  return Response.json({ error: error.message }, { status });
}

type WorkspaceRepositoryRetryAsync = (runtimeId: string, repositoryId: string) => Promise<unknown>;
