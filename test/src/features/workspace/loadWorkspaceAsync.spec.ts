import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assert, describe, it } from '@artiphishle/testosterone';

import { loadWorkspaceAsync } from '@/features/workspace/composition/loadWorkspaceAsync';

const EMPTY_DEPENDENCY_GRAPH = { edges: [], nodes: [] };

describe('[loadWorkspaceAsync]', () => {
  it('returns a serializable failure for a missing project root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'atlas-missing-'));
    await rm(root, { recursive: true, force: true });

    const result = await loadWorkspaceAsync(root, EMPTY_DEPENDENCY_GRAPH);

    assert.deepEqual(result, {
      ok: false,
      error: `Invalid or unavailable project path: ${root}`,
    });
  });

  it('keeps unexpected project failures inside the workspace error contract', async () => {
    const result = await loadWorkspaceAsync('\u0000', EMPTY_DEPENDENCY_GRAPH);

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(typeof result.error, 'string');
  });
});
