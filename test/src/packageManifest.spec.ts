import { readFile } from 'node:fs/promises';

import { isAppManifest } from '@ankhorage/contracts';
import type { Capability } from '@ankhorage/contracts/capability';
import { areCapabilityCatalogsEqual, isCapabilityCatalog } from '@ankhorage/capability';
import { dependencyGraphApi } from '@ankhorage/dependency-graph/api';
import { assert, describe, it } from '@artiphishle/testosterone';

import { CAPABILITIES } from '@/capabilities';

describe('[package manifest]', () => {
  it('publishes generated Node entrypoints without TypeScript runtime sources', async () => {
    const manifest = JSON.parse(await readFile('package.json', 'utf8')) as PackageManifest;

    assert.deepEqual(manifest.files, [
      'dist',
      'ankh.config.json',
      '.next/BUILD_ID',
      '.next/*.js',
      '.next/*.json',
      '.next/server',
      '.next/static',
      'offline/atlas-workspace.css',
      'offline/atlas-workspace.js',
      'README.md',
      'CHANGELOG.md',
      'LICENSE',
      'paradox',
    ]);
    assert.equal(manifest.files.includes('.next'), false);
    assert.equal(manifest.name, '@ankhorage/atlas');
    assert.equal(manifest.bin.atlas, 'dist/bin/atlas.js');
    assert.equal(manifest.ankh.provider, './dist/cli/index.js');
    assert.equal(manifest.scripts['build:package'] !== undefined, true);
    assert.equal(manifest.scripts.build.includes('bun run build:package'), true);
    assert.deepEqual(manifest.exports['./cli'], {
      types: './dist/cli/index.d.ts',
      import: './dist/cli/index.js',
    });
    assert.deepEqual(manifest.exports['./capabilities'], {
      types: './dist/capabilities/index.d.ts',
      import: './dist/capabilities/index.js',
    });
    const runtimeEntrypoints = [
      manifest.bin.atlas,
      manifest.ankh.provider,
      getRuntimeImportTarget(manifest.exports['./cli']),
      getRuntimeImportTarget(manifest.exports['./capabilities']),
    ];
    assert.equal(
      runtimeEntrypoints.some(entrypoint => entrypoint.endsWith('.ts')),
      false
    );
    const manifestCapabilities = manifest.ankh.capabilities as readonly Capability[];

    assert.equal(isCapabilityCatalog(manifestCapabilities), true);
    assert.equal(areCapabilityCatalogsEqual(CAPABILITIES, manifestCapabilities), true);
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
    assert.equal(manifest.infra.environments.local.deployment.compute.provider, 'local');
    assert.equal(manifest.infra.environments.local.deployment.runtime.provider, 'minikube');
    assert.deepEqual(manifest.infra.environments.local.workloads?.['atlas-web'], {
      id: 'atlas-web',
      artifact: { kind: 'image', image: 'atlas-web:local' },
      ports: { http: { port: 3000, publishedPort: 3000 } },
      environment: {
        ATLAS_PROJECT_PATH: { kind: 'literal', value: '/workspace' },
      },
      health: {
        kind: 'http',
        port: 3000,
        path: '/',
        intervalSeconds: 5,
        timeoutSeconds: 3,
        failureThreshold: 12,
      },
      exposure: 'public',
      replicas: 1,
    });
  });
});

interface PackageManifest {
  readonly ankh: {
    readonly capabilities: readonly Capability[];
    readonly provider: string;
  };
  readonly bin: Readonly<Record<string, string>>;
  readonly exports: Readonly<Record<string, PackageExportTarget>>;
  readonly files: readonly string[];
  readonly name: string;
  readonly scripts: Readonly<Record<string, string>>;
}

type PackageExportTarget = string | PackageRuntimeExport;

interface PackageRuntimeExport {
  readonly import: string;
  readonly types: string;
}

function getRuntimeImportTarget(exportTarget: PackageExportTarget): string {
  if (typeof exportTarget === 'string') {
    throw new Error('Runtime package exports must declare JavaScript and declaration targets.');
  }
  return exportTarget.import;
}
