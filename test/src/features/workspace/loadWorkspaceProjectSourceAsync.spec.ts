import { assert, describe, it } from '@artiphishle/testosterone';

import { loadWorkspaceProjectSourceAsync } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

describe('[loadWorkspaceProjectSourceAsync]', () => {
  it('keeps a rejected action as workspace state after GitHub materialization', async () => {
    const result = await loadWorkspaceProjectSourceAsync(
      'ankhorage/atlas',
      async () => {
        throw new Error('Dependency analysis failed.');
      },
      async source => ({
        source,
        rootPath: '/materialized/atlas',
        projectName: 'atlas',
        cleanupAsync: async () => {},
      })
    );

    assert.deepEqual(result.workspace, { ok: false, error: 'Dependency analysis failed.' });
    assert.equal(result.projectName, 'atlas');
  });

  it('keeps GitHub materialization errors distinct from action errors', async () => {
    const result = await loadWorkspaceProjectSourceAsync(
      'ankhorage/atlas',
      async () => {
        throw new Error('The action must not run.');
      },
      async () => {
        throw new Error('Unable to materialize GitHub repository.');
      }
    );

    assert.deepEqual(result.workspace, {
      ok: false,
      error: 'Unable to materialize GitHub repository.',
    });
  });
});
