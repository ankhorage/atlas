import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { assert, describe, it } from '@artiphishle/testosterone';

const repositoryRoot = resolve(import.meta.dir, '../../..');

describe('[CI ownership]', () => {
  it('runs Atlas-owned acceptance without a second impact planner', async () => {
    const acceptanceWorkflow = await readFile(
      resolve(repositoryRoot, '.github/workflows/acceptance.yml'),
      'utf8'
    );
    for (const command of [
      'bun run test:maven',
      'bun run test:gradle',
      'bun run test:offline-browser',
      'bun run test:compound-selection-browser',
      'bun run test:github-logout-browser',
      'bun run test:workspace-loading-browser',
      'bun run test:multi-project-browser',
    ]) {
      assert.equal(acceptanceWorkflow.includes(command), true);
    }
  });
});
