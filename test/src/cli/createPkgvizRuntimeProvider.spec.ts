import { assert, describe, it } from '@artiphishle/testosterone';

import { createPkgvizRuntimeProvider } from '@/cli/provider/createPkgvizRuntimeProvider';

describe('[createPkgvizRuntimeProvider]', () => {
  it('exposes the canonical Ankh PKGViz command surface', () => {
    const provider = createPkgvizRuntimeProvider();

    assert.equal(provider.id, 'pkgviz');
    assert.equal(provider.category, 'pkgviz');
    assert.deepEqual(provider.capabilities, ['pkgviz.audit', 'pkgviz.view', 'pkgviz.export']);
    assert.deepEqual(
      provider.commands.map(({ path, capability }) => ({ path, capability })),
      [
        { path: ['audit'], capability: 'pkgviz.audit' },
        { path: ['view'], capability: 'pkgviz.view' },
        { path: ['export'], capability: 'pkgviz.export' },
      ]
    );
    assert.deepEqual(
      provider.handlers.map(({ path }) => path),
      [['audit'], ['view'], ['export']]
    );
  });
});
