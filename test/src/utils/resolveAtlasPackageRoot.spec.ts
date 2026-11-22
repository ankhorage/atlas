import { resolve } from 'node:path';

import { assert, describe, it } from '@artiphishle/testosterone';

import { resolveAtlasPackageRoot } from '@/utils/resolveAtlasPackageRoot';

describe('[resolveAtlasPackageRoot]', () => {
  it('resolves the source package root through the public package manifest', () => {
    assert.equal(resolveAtlasPackageRoot(), resolve(import.meta.dir, '../../..'));
  });
});
