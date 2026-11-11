import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { assert, describe, it } from '@artiphishle/testosterone';

const workflowPath = resolve(import.meta.dir, '../../..', '.github/workflows/release.yml');

function getReleaseStep(workflow: string, name: string): string {
  const step = workflow
    .split('\n      - name: ')
    .slice(1)
    .find(candidate => candidate.startsWith(`${name}\n`));

  if (step === undefined) throw new Error(`Missing release workflow step: ${name}`);

  return step;
}

function getEnvironmentValue(step: string, name: string): string | undefined {
  return step.match(new RegExp(`^          ${name}: (?<value>.+)$`, 'm'))?.groups?.value;
}

describe('[release provider discovery authentication]', () => {
  it('uses the workflow token for every Ankh build and retains scoped tokens for release writes', async () => {
    const workflow = await readFile(workflowPath, 'utf8');
    const buildSteps = [
      'Build package',
      'Verify standalone packed install',
      'Publish unpublished packages',
    ];

    for (const name of buildSteps) {
      const step = getReleaseStep(workflow, name);

      assert.equal(getEnvironmentValue(step, 'GH_TOKEN'), '${{ github.token }}');
      assert.equal(getEnvironmentValue(step, 'GITHUB_TOKEN'), '${{ github.token }}');
      assert.equal(step.includes('GH_TOKEN: ${{ steps.release-token.outputs.token }}'), false);
      assert.equal(step.includes('GITHUB_TOKEN: ${{ steps.release-token.outputs.token }}'), false);
    }

    const checkout = getReleaseStep(workflow, 'Checkout repository');
    const versionPackages = getReleaseStep(workflow, 'Version packages directly on main');
    const publish = getReleaseStep(workflow, 'Publish unpublished packages');
    const verifyPublication = getReleaseStep(
      workflow,
      'Verify published npm artifact from a fresh runner'
    );
    const finalize = getReleaseStep(workflow, 'Finalize Changesets v3 tag and GitHub release');

    assert.equal(checkout.includes('token: ${{ steps.release-token.outputs.token }}'), true);
    assert.equal(versionPackages.includes('git push origin HEAD:main'), true);
    assert.equal(publish.includes('bun run changeset -- publish'), true);
    assert.equal(verifyPublication.includes('npm pack "$package_spec"'), true);
    assert.equal(
      getEnvironmentValue(finalize, 'GH_TOKEN'),
      '${{ steps.release-token.outputs.token }}'
    );
  });
});
