import { assert, describe, it } from '@artiphishle/testosterone';

import { createWorkspaceSelectionRoute } from '@/features/workspace/adapters/inbound/next/createWorkspaceSelectionRoute';
import { WorkspaceRepositoryRuntimeError } from '@/features/workspace/composition/createWorkspaceRepositoryRuntime';

describe('[workspace selection route]', () => {
  it('streams flat no-store NDJSON frames for a valid initial selection carrying source', async () => {
    const inputs: unknown[] = [];
    const POST = createWorkspaceSelectionRoute(async input => {
      inputs.push(input);
      return {
        runAsync: async publish => {
          await publish(frame('runtime-1', 'loading'));
          return frame('runtime-1', 'successful');
        },
      };
    });

    const response = await POST(
      selectionRequest({ addedRepositoryIds: ['repository-a'], generation: 1, source: 'Ankhorage' })
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(inputs, [
      {
        addedRepositoryIds: ['repository-a'],
        generation: 1,
        removedRepositoryIds: [],
        source: 'ankhorage',
      },
    ]);
    assert.deepEqual(
      (await response.text())
        .trim()
        .split('\n')
        .map(line => JSON.parse(line)),
      [transportFrame('runtime-1', 'loading'), transportFrame('runtime-1', 'successful')]
    );
  });

  it('rejects malformed initial diffs and returns recoverable 410 before opening a stream', async () => {
    const invalid = createWorkspaceSelectionRoute(async () => {
      throw new Error('Selection must not run.');
    });
    const invalidResponse = await invalid(
      selectionRequest({ removedRepositoryIds: ['repository-a'], source: 'ankhorage' })
    );
    assert.equal(invalidResponse.status, 400);

    const unavailable = createWorkspaceSelectionRoute(async () => {
      throw new WorkspaceRepositoryRuntimeError(
        'unavailable',
        'The workspace runtime is unavailable.'
      );
    });
    const unavailableResponse = await unavailable(
      selectionRequest({ runtimeId: 'runtime-1', source: 'ankhorage' })
    );
    assert.equal(unavailableResponse.status, 410);
    assert.deepEqual(await unavailableResponse.json(), {
      error: 'The workspace runtime is unavailable.',
      recoverable: true,
    });
  });
});

/*** Construct browser JSON exactly as the selection endpoint receives it. */
function selectionRequest(
  input: Partial<{
    readonly addedRepositoryIds: readonly string[];
    readonly generation: number;
    readonly removedRepositoryIds: readonly string[];
    readonly runtimeId: string;
    readonly source: string;
  }>
): Request {
  return new Request('http://atlas.test/api/workspace/selection', {
    body: JSON.stringify({
      addedRepositoryIds: input.addedRepositoryIds ?? [],
      generation: input.generation ?? 1,
      removedRepositoryIds: input.removedRepositoryIds ?? [],
      ...(input.runtimeId === undefined ? {} : { runtimeId: input.runtimeId }),
      source: input.source ?? 'ankhorage',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

/*** Produce the minimal credential-free runtime snapshot expected in every transport frame. */
function frame(runtimeId: string, status: 'loading' | 'successful') {
  return {
    currentSource: 'ankhorage',
    projectName: 'GitHub workspace',
    repositoryStatuses: [
      { repository: { id: 'repository-a', name: 'atlas', owner: 'ankhorage' }, status },
    ],
    runtimeId,
    workspace: { error: 'No selected GitHub repositories could be analyzed.', ok: false as const },
  };
}

/*** Represent only the four fields promised by the wire contract. */
function transportFrame(runtimeId: string, status: 'loading' | 'successful') {
  const result = frame(runtimeId, status);
  return {
    generation: 1,
    repositoryStatuses: result.repositoryStatuses,
    runtimeId: result.runtimeId,
    workspace: result.workspace,
  };
}
