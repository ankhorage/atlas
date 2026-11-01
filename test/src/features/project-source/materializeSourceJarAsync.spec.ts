import { createWriteStream } from 'node:fs';
import { access, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { assert, describe, expect, it } from '@artiphishle/testosterone';
import { ZipFile } from 'yazl';

import { materializeSourceJarAsync } from '@/features/project-source/adapters/outbound/archive/materializeSourceJarAsync';
import { loadProjectSourceAsync } from '@/features/project-source/composition/loadProjectSourceAsync';

describe('[source JAR materialization]', () => {
  it('materializes source entries into a temporary project and removes it after analysis', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'atlas-source-jar-test-'));
    const sourceJarPath = join(fixtureRoot, 'example-sources.jar');
    await createJarAsync(
      sourceJarPath,
      [{ name: 'src/example/Hello.java', content: 'package example; class Hello {}' }],
      ['META-INF/', 'src/', 'src/example/']
    );

    const materialized = await materializeSourceJarAsync(sourceJarPath);

    if (materialized === null) throw new Error('Expected a source JAR materialization.');
    expect(await readFile(join(materialized.rootPath, 'src/example/Hello.java'), 'utf8')).toBe(
      'package example; class Hello {}'
    );
    await materialized.cleanupAsync();
    await assert.rejects(access(materialized.rootPath));
    await rm(fixtureRoot, { force: true, recursive: true });
  });

  it('rejects binary-only JAR input without retaining extraction artifacts', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'atlas-source-jar-test-'));
    const sourceJarPath = join(fixtureRoot, 'binary.jar');
    await createJarAsync(sourceJarPath, [{ name: 'example/Hello.class', content: 'not-source' }]);

    await assertRejectedArchiveAsync(sourceJarPath, /Unsupported binary JAR input/);

    await rm(fixtureRoot, { force: true, recursive: true });
  });

  it('keeps unrelated local files on the existing filesystem path and rejects invalid JAR signatures', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'atlas-source-jar-test-'));
    const archiveNamedAsTextPath = join(fixtureRoot, 'source.txt');
    const invalidJarPath = join(fixtureRoot, 'not-a-jar.jar');
    await createJarAsync(archiveNamedAsTextPath, [
      { name: 'src/Hello.java', content: 'class Hello {}' },
    ]);
    await writeFile(invalidJarPath, 'not a JAR');

    expect(await materializeSourceJarAsync(archiveNamedAsTextPath)).toBe(null);
    await assertRejectedArchiveAsync(invalidJarPath, /Unsupported local archive input/);
    await rm(fixtureRoot, { force: true, recursive: true });
  });

  it('rejects traversal, oversized, and malformed archives before writing outside the temporary root', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'atlas-source-jar-test-'));
    const safeJarPath = join(fixtureRoot, 'safe.jar');
    await createJarAsync(safeJarPath, [{ name: 'src/aaa.java', content: 'class Example {}' }]);
    const traversalJarPath = join(fixtureRoot, 'traversal.jar');
    await writeFile(
      traversalJarPath,
      replaceArchiveEntryName(await readFile(safeJarPath), 'src/aaa.java', '../evil.java')
    );
    const oversizedJarPath = join(fixtureRoot, 'oversized.jar');
    await writeFile(
      oversizedJarPath,
      setCentralDirectorySize(await readFile(safeJarPath), 256 * 1024 * 1024 + 1)
    );
    const malformedJarPath = join(fixtureRoot, 'malformed.jar');
    await writeFile(malformedJarPath, 'not a JAR');
    const existingTemporaryRoots = await readSourceJarTemporaryRootsAsync();

    await assert.rejects(
      materializeSourceJarAsync(traversalJarPath),
      /Unsupported local archive input/
    );
    await assert.rejects(materializeSourceJarAsync(oversizedJarPath), /Source JAR expands/);
    await assert.rejects(
      materializeSourceJarAsync(malformedJarPath),
      /Unsupported local archive input/
    );
    await assert.rejects(stat(join(fixtureRoot, 'evil.java')));
    expect(await readSourceJarTemporaryRootsAsync()).toEqual(existingTemporaryRoots);
    await rm(fixtureRoot, { force: true, recursive: true });
  });

  it('rejects adversarial entries without escaping or retaining temporary extraction roots', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'atlas-source-jar-test-'));
    const outsidePath = join(fixtureRoot, 'outside.java');
    await writeFile(outsidePath, 'outside content');
    const archiveCases = [
      {
        name: 'symbolic link',
        entries: [{ name: 'src/linked.java', content: 'target', mode: 0o120777 }],
        error: /unsupported link or special entry/,
      },
      {
        name: 'special file',
        entries: [{ name: 'src/pipe.java', content: 'target', mode: 0o010644 }],
        error: /unsupported link or special entry/,
      },
      {
        name: 'duplicate archive target',
        entries: [
          { name: 'src/a.java', content: 'class A {}' },
          { name: 'src/a.java', content: 'class B {}' },
        ],
        error: /duplicate archive entries/,
      },
      {
        name: 'file-directory collision',
        entries: [
          { name: 'src/node', content: 'not a directory' },
          { name: 'src/node/Child.java', content: 'class Child {}' },
        ],
        error: /colliding archive entries/,
      },
      {
        name: 'empty inner segment',
        entries: [{ name: 'src//Empty.java', content: 'class Empty {}' }],
        error: /unsafe entry path/,
      },
    ] as const;

    for (const [index, archiveCase] of archiveCases.entries()) {
      const archivePath = join(fixtureRoot, `${index}.jar`);
      await createJarAsync(archivePath, archiveCase.entries);
      await assertRejectedArchiveAsync(archivePath, archiveCase.error);
      expect(await readFile(outsidePath, 'utf8')).toBe('outside content');
    }
    await rm(fixtureRoot, { force: true, recursive: true });
  });

  it('enforces controlled entry and actual extracted-byte limits without retaining temporary roots', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'atlas-source-jar-test-'));
    const outsidePath = join(fixtureRoot, 'outside.java');
    await writeFile(outsidePath, 'outside content');
    const entryLimitedArchivePath = join(fixtureRoot, 'too-many-entries.jar');
    await createJarAsync(entryLimitedArchivePath, [
      { name: 'src/A.java', content: 'class A {}' },
      { name: 'src/B.java', content: 'class B {}' },
      { name: 'src/C.java', content: 'class C {}' },
    ]);
    await assertRejectedArchiveAsync(entryLimitedArchivePath, /too many entries/, {
      maxEntryCount: 2,
    });
    expect(await readFile(outsidePath, 'utf8')).toBe('outside content');

    const byteLimitedArchivePath = join(fixtureRoot, 'actual-byte-limit.jar');
    await createJarAsync(byteLimitedArchivePath, [
      { name: 'src/Actual.java', content: 'eight-bytes' },
    ]);
    await writeFile(
      byteLimitedArchivePath,
      setArchiveEntrySize(await readFile(byteLimitedArchivePath), 11, 4)
    );
    await assertRejectedArchiveAsync(byteLimitedArchivePath, /expands beyond/, {
      maxUncompressedSize: 4,
    });
    expect(await readFile(outsidePath, 'utf8')).toBe('outside content');
    await rm(fixtureRoot, { force: true, recursive: true });
  });

  it('aborts source-JAR materialization through the project-source adapter and removes the temporary root', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'atlas-source-jar-test-'));
    const sourceJarPath = join(fixtureRoot, 'aborted.jar');
    await createJarAsync(sourceJarPath, [
      { name: 'src/Large.java', content: 'x'.repeat(16 * 1024 * 1024), compress: false },
    ]);
    const controller = new AbortController();
    const existingTemporaryRoots = await readSourceJarTemporaryRootsAsync();
    const materialization = loadProjectSourceAsync(
      { kind: 'filesystem', path: sourceJarPath },
      controller.signal
    );

    await waitForNewTemporaryRootAsync(existingTemporaryRoots);
    controller.abort(new Error('Source JAR materialization was aborted.'));

    await assert.rejects(materialization, /materialization was aborted/);
    expect(await readSourceJarTemporaryRootsAsync()).toEqual(existingTemporaryRoots);
    await rm(fixtureRoot, { force: true, recursive: true });
  });
});

type TestArchiveEntry = {
  readonly name: string;
  readonly content: string;
  readonly compress?: boolean;
  readonly mode?: number;
};

async function createJarAsync(
  path: string,
  entries: readonly TestArchiveEntry[],
  directories: readonly string[] = []
): Promise<void> {
  const archive = new ZipFile();
  directories.forEach(directory => archive.addEmptyDirectory(directory));
  entries.forEach(entry =>
    archive.addBuffer(Buffer.from(entry.content), entry.name, {
      compress: entry.compress,
      mode: entry.mode,
    })
  );
  archive.end();
  await pipeline(archive.outputStream, createWriteStream(path));
}

async function assertRejectedArchiveAsync(
  archivePath: string,
  error: RegExp,
  limits: { readonly maxEntryCount?: number; readonly maxUncompressedSize?: number } = {}
): Promise<void> {
  const existingTemporaryRoots = await readSourceJarTemporaryRootsAsync();
  await assert.rejects(materializeSourceJarAsync(archivePath, { limits }), error);
  expect(await readSourceJarTemporaryRootsAsync()).toEqual(existingTemporaryRoots);
}

async function readSourceJarTemporaryRootsAsync(): Promise<readonly string[]> {
  return (await readdir(tmpdir())).filter(entry => entry.startsWith('atlas-source-jar-')).sort();
}

async function waitForNewTemporaryRootAsync(
  existingTemporaryRoots: readonly string[]
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (
      (await readSourceJarTemporaryRootsAsync()).some(
        root => !existingTemporaryRoots.includes(root)
      )
    ) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  throw new Error('Expected source JAR materialization to allocate a temporary root.');
}

function replaceArchiveEntryName(bytes: Buffer, source: string, target: string): Buffer {
  if (source.length !== target.length)
    throw new Error('Archive fixture entry names must have equal lengths.');
  const result = Buffer.from(bytes);
  let offset = result.indexOf(source);
  while (offset !== -1) {
    result.write(target, offset, source.length, 'utf8');
    offset = result.indexOf(source, offset + source.length);
  }
  return result;
}

function setCentralDirectorySize(bytes: Buffer, size: number): Buffer {
  const result = Buffer.from(bytes);
  const centralDirectoryOffset = result.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  if (centralDirectoryOffset === -1) throw new Error('Expected a ZIP central directory entry.');
  result.writeUInt32LE(size, centralDirectoryOffset + 24);
  return result;
}

function setArchiveEntrySize(bytes: Buffer, sourceSize: number, targetSize: number): Buffer {
  const result = Buffer.from(bytes);
  const localFileHeaderOffset = result.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const centralDirectoryOffset = result.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  if (localFileHeaderOffset === -1 || centralDirectoryOffset === -1) {
    throw new Error('Expected ZIP local and central directory entries.');
  }
  if (
    result.readUInt32LE(localFileHeaderOffset + 22) !== sourceSize ||
    result.readUInt32LE(centralDirectoryOffset + 24) !== sourceSize
  ) {
    throw new Error('Expected the source archive entry size.');
  }
  result.writeUInt32LE(targetSize, localFileHeaderOffset + 22);
  result.writeUInt32LE(targetSize, centralDirectoryOffset + 24);
  return result;
}
