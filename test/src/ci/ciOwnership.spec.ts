import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { assert, describe, it } from '@artiphishle/testosterone';

const repositoryRoot = resolve(import.meta.dir, '../../..');

describe('[CI ownership]', () => {
  it('keeps the managed impact wrapper canonical and Atlas acceptance independent', async () => {
    const [acceptanceWorkflow, ciWorkflow, impactWrapper] = await Promise.all([
      readFile(resolve(repositoryRoot, '.github/workflows/acceptance.yml'), 'utf8'),
      readFile(resolve(repositoryRoot, '.github/workflows/ci.yml'), 'utf8'),
      readFile(resolve(repositoryRoot, '.github/scripts/ci-impact.ts'), 'utf8'),
    ]);

    assert.equal(
      impactWrapper,
      "import { runCiImpact } from '@ankhorage/devtools/ci-impact';\n\nrunCiImpact(process.argv.slice(2));\n"
    );
    assert.equal(ciWorkflow.includes('bun .github/scripts/ci-impact.ts plan'), true);
    assert.equal(ciWorkflow.includes('dorny/paths-filter'), false);

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
