import { assert, describe, it } from '@artiphishle/testosterone';

import { createWorkspaceRetryRoute } from '@/features/workspace/adapters/inbound/next/createWorkspaceRetryRoute';
import { WorkspaceRepositoryRuntimeError } from '@/features/workspace/composition/createWorkspaceRepositoryRuntime';

describe('[workspace retry route]', () => {
  it('accepts a valid retry request and returns only the retry payload', async () => {
    const POST = createWorkspaceRetryRoute(async (runtimeId, repositoryId) => ({
      repositoryStatuses: [
        { repository: { id: repositoryId, name: 'catalog', owner: 'owner' }, status: 'successful' },
      ],
      runtimeId,
      workspace: {
        ok: false as const,
        error: 'No selected GitHub repositories could be analyzed.',
      },
    }));

    const response = await POST(
      retryRequest({ repositoryId: 'repository-D', runtimeId: 'runtime-1' })
    );
    const result: unknown = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(result, {
      repositoryStatuses: [
        {
          repository: { id: 'repository-D', name: 'catalog', owner: 'owner' },
          status: 'successful',
        },
      ],
      runtimeId: 'runtime-1',
      workspace: { ok: false, error: 'No selected GitHub repositories could be analyzed.' },
    });
  });

  it('rejects malformed requests before the runtime and maps runtime failures to HTTP', async () => {
    const errors = [
      ['invalid', 400],
      ['stale', 409],
      ['unavailable', 410],
      ['rate-limited', 429],
    ] as const;
    const invalid = createWorkspaceRetryRoute(async () => {
      throw new Error('Retry must not run for an invalid request.');
    });
    const invalidResponse = await invalid(
      retryRequest({ repositoryId: '', runtimeId: 'runtime-1' })
    );
    assert.equal(invalidResponse.status, 400);

    for (const [kind, expectedStatus] of errors) {
      const POST = createWorkspaceRetryRoute(async () => {
        throw new WorkspaceRepositoryRuntimeError(kind, 'internal /private/tmp/token=secret');
      });
      const response = await POST(
        retryRequest({ repositoryId: 'repository-D', runtimeId: 'runtime-1' })
      );
      assert.equal(response.status, expectedStatus);
    }
  });
});

/*** Build the actual JSON transport envelope used by the production React client. */
function retryRequest(body: {
  readonly repositoryId: string;
  readonly runtimeId: string;
}): Request {
  return new Request('http://atlas.test/api/workspace/retry', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}
