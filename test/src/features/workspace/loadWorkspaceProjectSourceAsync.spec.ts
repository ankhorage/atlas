import { resolve } from 'node:path';

import { assert, describe, it } from '@artiphishle/testosterone';

import { loadWorkspaceProjectSourceAsync } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

describe('[loadWorkspaceProjectSourceAsync]', () => {
  it('loads the local project configured at server runtime', async () => {
    const previousProjectPath = process.env.ATLAS_PROJECT_PATH;
    process.env.ATLAS_PROJECT_PATH = resolve('examples/java/my-app');

    try {
      const result = await loadWorkspaceProjectSourceAsync(undefined, async () => ({
        edges: [],
        nodes: [],
      }));

      assert.equal(result.projectName, 'my-app');
      assert.equal(result.workspace.ok, true);
    } finally {
      if (previousProjectPath === undefined) delete process.env.ATLAS_PROJECT_PATH;
      else process.env.ATLAS_PROJECT_PATH = previousProjectPath;
    }
  });

  it('keeps a rejected action as workspace state after GitHub materialization', async () => {
    const result = await loadWorkspaceProjectSourceAsync(
      'ankhorage/atlas',
      async () => {
        throw new Error('Dependency analysis failed.');
      },
      async source => ({
        source,
        rootPath: resolve('examples/java/my-app'),
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
