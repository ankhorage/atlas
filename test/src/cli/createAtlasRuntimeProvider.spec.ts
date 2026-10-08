import { assert, describe, it } from '@artiphishle/testosterone';

import { CAPABILITIES } from '@/capabilities';
import { createAtlasRuntimeProvider } from '@/cli/provider/createAtlasRuntimeProvider';

import packageJson from '../../../package.json';

describe('[createAtlasRuntimeProvider]', () => {
  it('exposes the canonical Ankh Atlas command surface', () => {
    const provider = createAtlasRuntimeProvider();

    assert.equal(provider.id, 'atlas');
    assert.equal(provider.category, 'atlas');
    assert.equal(provider.version, packageJson.version);
    assert.deepEqual(provider.capabilities, CAPABILITIES);
    assert.deepEqual(
      provider.commands.map(({ path, capability }) => ({ path, capability })),
      [
        { path: ['audit'], capability: 'atlas.audit' },
        { path: ['inspect'], capability: 'atlas.inspect' },
        { path: ['export'], capability: 'atlas.export' },
      ]
    );
    assert.deepEqual(
      provider.handlers.map(({ path }) => path),
      [['audit'], ['inspect'], ['export']]
    );
  });
});
