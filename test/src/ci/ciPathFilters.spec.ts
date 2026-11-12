import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { assert, describe, it } from '@artiphishle/testosterone';

const workflowPath = resolve(import.meta.dir, '../../..', '.github/workflows/ci.yml');

describe('[CI expensive acceptance path filters]', () => {
  it('runs every expensive acceptance path for runtime configuration changes', async () => {
    const workflow = await readFile(workflowPath, 'utf8');

    for (const path of [
      "'.github/workflows/**'",
      "'ankh.config.json'",
      "'next.config.*'",
      "'tsconfig*.json'",
      "'package.json'",
      "'bun.lock'",
    ]) {
      assert.equal(workflow.includes(path), true);
    }

    for (const check of ['jvm', 'offline_browser', 'compound_browser']) {
      assert.equal(
        workflow.includes(
          `steps.changes.outputs.configurations == 'true' || steps.changes.outputs.${check} == 'true'`
        ),
        true
      );
    }
  });

  it('covers exported compound workspaces and path removal or renames', async () => {
    const workflow = await readFile(workflowPath, 'utf8');

    for (const filter of ['configurations', 'jvm', 'offline_browser', 'compound_browser']) {
      assert.equal(workflow.includes(`${filter}:\n              - added|modified|deleted:`), true);
    }
    assert.equal(workflow.includes("'src/features/offline-export/**'"), true);
    assert.equal(workflow.includes("'test/e2e/offlineWorkspace.ts'"), true);
  });
});
