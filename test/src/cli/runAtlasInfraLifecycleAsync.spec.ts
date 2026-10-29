import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assert, describe, it } from '@artiphishle/testosterone';

import { runAtlasInfraLifecycleAsync } from '@/cli/runAtlasInfraLifecycleAsync';

describe('[Atlas Infra lifecycle]', () => {
  it('validates, plans, and records the declared local environment without inventing deployment artifacts', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'atlas-infra-'));

    try {
      await writeFile(
        join(projectPath, 'ankh.config.json'),
        await readFile('ankh.config.json', 'utf8')
      );

      const validate = await runAtlasInfraLifecycleAsync('validate', { projectPath });
      const plan = await runAtlasInfraLifecycleAsync('plan', { projectPath });
      const generate = await runAtlasInfraLifecycleAsync('generate', { projectPath });

      assert.equal(validate.ok, true);
      assert.equal(plan.ok, true);
      assert.equal(generate.ok, true);
      if (!plan.ok || !generate.ok) return;
      assert.equal(plan.value.environment, 'local');
      assert.equal(generate.value.environment, 'local');
      assert.equal('ledger' in generate.value, true);
      if (!('artifacts' in generate.value)) return;
      assert.deepEqual(generate.value.artifacts, []);
    } finally {
      await rm(projectPath, { recursive: true, force: true });
    }
  });
});
