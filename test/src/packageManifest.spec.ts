import { readFile } from 'node:fs/promises';

import {
  areCapabilitiesEqual,
  isAppManifest,
  isCapability,
  type Capability,
} from '@ankhorage/contracts';
import { dependencyGraphApi } from '@ankhorage/dependency-graph/api';
import { assert, describe, it } from '@artiphishle/testosterone';

import { CAPABILITIES } from '@/capabilities';

describe('[package manifest]', () => {
  it('publishes production Next.js output without build caches', async () => {
    const manifest = JSON.parse(await readFile('package.json', 'utf8')) as PackageManifest;

    assert.deepEqual(manifest.files, [
      'bin',
      'ankh.config.json',
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
    assert.equal(manifest.exports['./capabilities'], './src/capabilities/index.ts');
    const manifestCapabilities = manifest.ankh.capabilities as readonly Capability[];

    assert.equal(manifestCapabilities.every(isCapability), true);
    assert.equal(
      new Set(manifestCapabilities.map(({ id }) => id)).size,
      manifestCapabilities.length
    );
    assert.equal(
      manifestCapabilities.length === CAPABILITIES.length &&
        manifestCapabilities.every(capability =>
          CAPABILITIES.some(sourceCapability => areCapabilitiesEqual(sourceCapability, capability))
        ),
      true
    );
  });

  it('declares Atlas as a canonical app with the dependency-graph action binding', async () => {
    const manifest: unknown = JSON.parse(await readFile('ankh.config.json', 'utf8'));

    assert.equal(isAppManifest(manifest), true);
    if (!isAppManifest(manifest)) return;
    assert.equal(manifest.metadata.category, 'developer_tools');
    assert.equal(manifest.activeThemeMode, 'light');
    assert.equal(manifest.navigator.routes[0]?.screenId, 'workspace');
    assert.equal(
      manifest.infra.apis?.['dependency-graph']?.endpoints.actions.operations['dependency-graph']
        ?.intent,
      'action'
    );
    assert.deepEqual(manifest.infra.apis?.['dependency-graph'], dependencyGraphApi.definition);
    assert.equal(manifest.themes[manifest.activeThemeId]?.id, manifest.metadata.themeId);
  });
});

interface PackageManifest {
  readonly ankh: {
    readonly capabilities: readonly Capability[];
  };
  readonly bin: Readonly<Record<string, string>>;
  readonly exports: Readonly<Record<string, string>>;
  readonly files: readonly string[];
  readonly name: string;
}
