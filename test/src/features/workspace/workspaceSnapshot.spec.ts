import { resolve } from 'node:path';

import { createDependencyGraphAsync } from '@ankhorage/dependency-graph';
import { assert, describe, it } from '@artiphishle/testosterone';

import { readProjectSnapshotAsync } from '@/features/project-analysis/composition/readProjectSnapshotAsync';
import { createWorkspaceSnapshot } from '@/features/workspace/application/use-cases/createWorkspaceSnapshot';
import { serializeWorkspaceSnapshot } from '@/features/workspace/application/use-cases/serializeWorkspaceSnapshot';
import { loadEmbeddedWorkspaceSnapshot } from '@/features/workspace/composition/loadEmbeddedWorkspaceSnapshot';
import { loadWorkspaceAsync } from '@/features/workspace/composition/loadWorkspaceAsync';

describe('[workspace snapshots]', () => {
  it('hydrates the live Java fixture and its embedded snapshot into the same graph, tree, and audit state', async () => {
    const projectPath = resolve('examples/java/my-app');
    const live = await loadWorkspaceAsync(projectPath, inspection =>
      createDependencyGraphAsync({ projects: [{ id: 'current', inspection }] })
    );
    const embedded = loadEmbeddedWorkspaceSnapshot(
      serializeWorkspaceSnapshot(
        createWorkspaceSnapshot(await readProjectSnapshotAsync(projectPath))
      )
    );

    assert.equal(live.ok, true);
    assert.equal(embedded.ok, true);
    if (!live.ok || !embedded.ok) return;
    assert.deepEqual(embedded.value, live.value);
  });

  it('keeps snapshot version and schema errors explicit in persistent workspace state', () => {
    assert.deepEqual(loadEmbeddedWorkspaceSnapshot('{"version":2}'), {
      ok: false,
      error: 'Unsupported Atlas workspace snapshot version: 2.',
    });
    assert.deepEqual(loadEmbeddedWorkspaceSnapshot('{"version":1,"audit":{}}'), {
      ok: false,
      error: 'Invalid Atlas workspace snapshot schema.',
    });
  });
});
