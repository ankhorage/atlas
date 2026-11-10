import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { assert, describe, it } from '@artiphishle/testosterone';

const workflowPath = resolve(import.meta.dir, '../../..', '.github/workflows/release.yml');

describe('[release provider discovery authentication]', () => {
  it('uses the workflow token for Ankh catalog discovery and retains the scoped token for writes', async () => {
    const workflow = await readFile(workflowPath, 'utf8');
    const buildStep = workflow.match(
      /- name: Build package\n        env:\n(?<environment>[\s\S]*?)        run:/
    );

    assert.equal(buildStep?.groups?.environment.includes('GH_TOKEN: ${{ github.token }}'), true);
    assert.equal(
      buildStep?.groups?.environment.includes('GITHUB_TOKEN: ${{ github.token }}'),
      true
    );
    assert.equal(workflow.includes('token: ${{ steps.release-token.outputs.token }}'), true);
    assert.equal(workflow.includes('GH_TOKEN: ${{ steps.release-token.outputs.token }}'), true);
  });
});
