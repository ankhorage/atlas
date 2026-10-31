import { createWriteStream } from 'node:fs';
import { access, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { assert, describe, expect, it } from '@artiphishle/testosterone';
import { ZipFile } from 'yazl';

import { materializeSourceJarAsync } from '@/features/project-source/adapters/outbound/archive/materializeSourceJarAsync';

describe('[source JAR materialization]', () => {
  it('materializes source entries into a temporary project and removes it after analysis', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'atlas-source-jar-test-'));
    const sourceJarPath = join(fixtureRoot, 'example-sources.jar');
    await createJarAsync(sourceJarPath, [
      ['src/example/Hello.java', 'package example; class Hello {}'],
    ]);

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
    await createJarAsync(sourceJarPath, [['example/Hello.class', 'not-source']]);

    await assert.rejects(materializeSourceJarAsync(sourceJarPath), /Unsupported binary JAR input/);

    await rm(fixtureRoot, { force: true, recursive: true });
  });

  it('rejects traversal, oversized, and malformed archives before writing outside the temporary root', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'atlas-source-jar-test-'));
    const safeJarPath = join(fixtureRoot, 'safe.jar');
    await createJarAsync(safeJarPath, [['src/aaa.java', 'class Example {}']]);
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
    await rm(fixtureRoot, { force: true, recursive: true });
  });
});

async function createJarAsync(
  path: string,
  entries: readonly (readonly [string, string])[]
): Promise<void> {
  const archive = new ZipFile();
  entries.forEach(([name, content]) => archive.addBuffer(Buffer.from(content), name));
  archive.end();
  await pipeline(archive.outputStream, createWriteStream(path));
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
