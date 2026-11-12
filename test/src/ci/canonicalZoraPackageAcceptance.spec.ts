import { access, readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import type { GraphViewController } from '@ankhorage/zora/web/graph-view';
import { GraphView } from '@ankhorage/zora/web/graph-view';
import { ZoraProvider } from '@ankhorage/zora/web/runtime';
import type { TreeItemNode } from '@ankhorage/zora/web/tree-view';
import { TreeView } from '@ankhorage/zora/web/tree-view';
import { View } from '@ankhorage/zora/web/view';
import { assert, describe, it } from '@artiphishle/testosterone';

const root = resolve(import.meta.dir, '../../..');
const require = createRequire(import.meta.url);
const packageName = '@ankhorage/zora';
const packageSpecifiers = [
  `${packageName}/web/runtime`,
  `${packageName}/web/graph-view`,
  `${packageName}/web/tree-view`,
  `${packageName}/web/view`,
] as const;

describe('[canonical ZORA package acceptance]', () => {
  it('resolves the declared and locked published package through its public web exports', async () => {
    const packageManifestPath = require.resolve(`${packageName}/package.json`);
    const packageManifest = JSON.parse(await readFile(packageManifestPath, 'utf8')) as {
      name?: unknown;
      version?: unknown;
    };
    const atlasManifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, unknown>;
    };
    const declaredVersion = atlasManifest.dependencies?.[packageName];
    const lockfile = await readFile(resolve(root, 'bun.lock'), 'utf8');
    const packageRoot = dirname(packageManifestPath);

    assert.equal(packageManifest.name, packageName);
    assert.equal(typeof declaredVersion, 'string');
    assert.equal(packageManifest.version, declaredVersion);
    assert.equal(lockfile.includes(`"${packageName}": ["${packageName}@${declaredVersion}"`), true);

    for (const specifier of packageSpecifiers) {
      const resolvedModulePath = require.resolve(specifier);
      const packageRelativeModulePath = relative(packageRoot, resolvedModulePath);

      assert.equal(packageRelativeModulePath === '..', false);
      assert.equal(packageRelativeModulePath.startsWith(`..${sep}`), false);
      assert.equal(isAbsolute(packageRelativeModulePath), false);
      await access(resolvedModulePath.replace(/\.js$/u, '.d.ts'));
    }

    const publicDeclarations: [
      typeof ZoraProvider,
      typeof GraphView,
      typeof TreeView,
      typeof View,
      GraphViewController | undefined,
      TreeItemNode | undefined,
    ] = [ZoraProvider, GraphView, TreeView, View, undefined, undefined];

    assert.equal(publicDeclarations.slice(0, 4).every(Boolean), true);
  });

  it('contains neither local ZORA aliases nor materialized or sibling-source imports', async () => {
    const tsconfig = JSON.parse(await readFile(resolve(root, 'tsconfig.json'), 'utf8')) as {
      compilerOptions?: { paths?: Record<string, readonly string[]> };
    };
    const aliases = tsconfig.compilerOptions?.paths ?? {};
    const aliasPrefix = `@${'zora'}/`;
    const materializedDirectory = `.${'ankh'}/${'zora'}`;

    assert.equal(
      Object.keys(aliases).some(alias => alias.startsWith(aliasPrefix)),
      false
    );
    assert.equal(
      Object.values(aliases)
        .flat()
        .some(target => target.includes(materializedDirectory)),
      false
    );
    await assert.rejects(access(resolve(root, materializedDirectory)));

    const sourceFiles = await readSourceFiles(['src', 'test/e2e', 'test/src']);
    const forbiddenReferences = sourceFiles.filter(
      ([, source]) =>
        source.includes(aliasPrefix) ||
        source.includes(materializedDirectory) ||
        /@ankhorage\/zora\/(?:src|web-dist)\//u.test(source) ||
        /\.\.\/(?:\.\.\/)*zora\/(?:src|web-dist)\//u.test(source)
    );

    assert.deepEqual(forbiddenReferences, []);
  });
});

async function readSourceFiles(
  directories: readonly string[]
): Promise<readonly (readonly [string, string])[]> {
  const files = await Promise.all(
    directories.map(directory => readSourceFilesInDirectory(resolve(root, directory)))
  );

  return files.flat();
}

async function readSourceFilesInDirectory(
  directory: string
): Promise<readonly (readonly [string, string])[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async entry => {
      const path = resolve(directory, entry.name);

      if (entry.isDirectory()) {
        return readSourceFilesInDirectory(path);
      }
      if (!entry.isFile() || !/\.(?:ts|tsx|mts|cts)$/u.test(entry.name)) {
        return [];
      }

      return [[path, await readFile(path, 'utf8')]] as const;
    })
  );

  return files.flat();
}
