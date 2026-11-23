import { assert, describe, it } from '@artiphishle/testosterone';

import { createWorkspaceProgressResponse } from '@/features/workspace/adapters/inbound/next/createWorkspaceProgressResponse';

describe('[createWorkspaceProgressResponse]', () => {
  it('emits each supplied snapshot immediately as safe NDJSON and disables caching', async () => {
    const response = createWorkspaceProgressResponse(7, async publish => {
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
        {
          generation: 7,
          projectName: 'GitHub workspace',
          repositoryStatuses: [],
          runtimeId: 'first',
          workspace: result('first').workspace,
        },
        {
          generation: 7,
          projectName: 'GitHub workspace',
          repositoryStatuses: [],
          runtimeId: 'second',
          workspace: result('second').workspace,
        },
      ]
    );
  });

  it('ends a failed stream with one bounded terminal error frame after prior progress', async () => {
    const response = createWorkspaceProgressResponse(8, async publish => {
      await publish(result('first'));
      throw new Error('token=secret /private/tmp');
    });

    assert.deepEqual(parseFrames(await response.text()), [
      progressFrame(8, result('first')),
      { error: 'Workspace progress stream failed.', generation: 8, type: 'terminal-error' },
    ]);
  });

  it('aborts the active operation when a reader cancels', async () => {
    let cancelled = false;
    const response = createWorkspaceProgressResponse(
      9,
      async (_publish, signal) =>
        new Promise(() => {
          signal.addEventListener('abort', () => {
            cancelled = true;
          });
        })
    );
    const reader = response.body?.getReader();
    if (reader === undefined) throw new Error('Expected a response body.');
    await reader.cancel();
    await Promise.resolve();
    assert.equal(cancelled, true);
  });

  it('applies reader backpressure while delivering all 80 and 87 progress frames', async () => {
    for (const count of [80, 87]) {
      let published = 0;
      const response = createWorkspaceProgressResponse(10, async publish => {
        for (const index of Array.from({ length: count - 1 }, (_, value) => value)) {
          await publish(result(`runtime-${index}`));
          published += 1;
        }
        return result(`runtime-${count - 1}`);
      });
      const reader = response.body?.getReader();
      if (reader === undefined) throw new Error('Expected a response body.');
      await Promise.resolve();
      assert.equal(published, 0);
      const frames = await readFrames(reader);
      assert.equal(frames.length, count);
    }
  });
});

/*** Decode every complete NDJSON record from a reader without assuming browser chunk boundaries. */
async function readFrames(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<unknown[]> {
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return parseFrames(text);
    text += decoder.decode(value, { stream: true });
  }
}

/*** Parse complete test-owned NDJSON records into their browser-visible frame values. */
function parseFrames(body: string): unknown[] {
  return body
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

/*** Build the unchanged success-wire shape used by all progressive stream assertions. */
function progressFrame(generation: number, value: ReturnType<typeof result>) {
  return {
    generation,
    projectName: value.projectName,
    repositoryStatuses: value.repositoryStatuses,
    runtimeId: value.runtimeId,
    workspace: value.workspace,
  };
}

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
