import { assert, describe, it } from '@artiphishle/testosterone';

import { createWorkspaceProgressResponse } from '@/features/workspace/adapters/inbound/next/createWorkspaceProgressResponse';

describe('[createWorkspaceProgressResponse]', () => {
  it('emits each supplied snapshot immediately as safe NDJSON and disables caching', async () => {
    const response = createWorkspaceProgressResponse(async publish => {
      await publish(result('first'));
      return result('second');
    });
    const body = await response.text();
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('content-type'), 'application/x-ndjson; charset=utf-8');
    assert.deepEqual(
      body
        .trim()
        .split('\n')
        .map(line => JSON.parse(line)),
      [
        { result: result('first'), type: 'workspace' },
        { result: result('second'), type: 'workspace' },
      ]
    );
  });
});

/*** Build the smallest browser-safe runtime snapshot for transport-boundary coverage. */
function result(runtimeId: string) {
  return {
    currentSource: 'owner',
    projectName: 'GitHub workspace',
    repositoryStatuses: [],
    runtimeId,
    workspace: { error: 'No selected GitHub repositories could be analyzed.', ok: false as const },
  };
}
