import { assert, describe, it } from '@artiphishle/testosterone';
import { isCapabilityCatalog } from '@ankhorage/capability';

import { CAPABILITIES } from '@/capabilities';
import { createAtlasRuntimeProvider } from '@/cli/provider/createAtlasRuntimeProvider';

describe('[Atlas capability catalog]', () => {
  it('maps each command to one catalog capability without positional coupling', () => {
    const provider = createAtlasRuntimeProvider();
    const catalogIds = new Set<string>(CAPABILITIES.map(({ id }) => id));
    const commandIds = new Set<string>(provider.commands.map(({ capability }) => capability));

    assert.equal(isCapabilityCatalog(CAPABILITIES), true);
    assert.equal(isCapabilityCatalog(provider.capabilities), true);
    assert.equal(commandIds.size, provider.commands.length);
    assert.equal(catalogIds.size, CAPABILITIES.length);
    assert.equal(
      [...catalogIds].every(capabilityId => commandIds.has(capabilityId)),
      true
    );
    assert.equal(
      [...commandIds].every(capabilityId => catalogIds.has(capabilityId)),
      true
    );
    assert.equal(
      provider.capabilities.length === CAPABILITIES.length &&
        provider.capabilities.every(({ id }) => catalogIds.has(id)),
      true
    );
  });

  it('supports the public capability catalog import', async () => {
    const consumer = await import('@ankhorage/atlas/capabilities');

    assert.deepEqual(consumer.CAPABILITIES, CAPABILITIES);
  });
});
