import { readFile } from 'node:fs/promises';

import { assert, describe, it } from '@artiphishle/testosterone';

describe('[package manifest]', () => {
  it('publishes production Next.js output without build caches', async () => {
    const manifest = JSON.parse(await readFile('package.json', 'utf8')) as PackageManifest;

    assert.deepEqual(manifest.files, [
      'bin',
      'src',
      'tsconfig.json',
      '.next/BUILD_ID',
      '.next/*.js',
      '.next/*.json',
      '.next/server',
      '.next/static',
      'README.md',
      'CHANGELOG.md',
      'LICENSE',
      'paradox',
    ]);
    assert.equal(manifest.files.includes('.next'), false);
    assert.equal(manifest.name, '@ankhorage/atlas');
    assert.equal(manifest.bin.atlas, 'bin/atlas.ts');
    assert.equal(manifest.exports['./cli'], './src/cli/index.ts');
  });
});

interface PackageManifest {
  readonly bin: Readonly<Record<string, string>>;
  readonly exports: Readonly<Record<string, string>>;
  readonly files: readonly string[];
  readonly name: string;
}
