import { assert, describe, it } from '@artiphishle/testosterone';

import { createAtlasRuntimeProvider } from '@/cli/provider/createAtlasRuntimeProvider';

describe('[createAtlasRuntimeProvider]', () => {
  it('exposes the canonical Ankh Atlas command surface', () => {
    const provider = createAtlasRuntimeProvider();

    assert.equal(provider.id, 'atlas');
    assert.equal(provider.category, 'atlas');
    assert.deepEqual(provider.capabilities, ['atlas.audit', 'atlas.inspect', 'atlas.export']);
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
