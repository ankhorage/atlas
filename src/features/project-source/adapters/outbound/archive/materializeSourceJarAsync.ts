import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { type Entry, openPromise, type ZipFile } from 'yauzl';

import type { LocalProjectMaterialization } from '@/types/projectSource';

const MAX_ENTRY_COUNT = 10_000;
const MAX_UNCOMPRESSED_SIZE = 256 * 1024 * 1024;
const SOURCE_FILE_EXTENSION = /\.(?:c|cc|cpp|cxx|dpr|h|hpp|java|js|jsx|kt|kts|pas|py|ts|tsx)$/iu;
const UNIX_FILE_TYPE_MASK = 0o170000;
const UNIX_DIRECTORY_TYPE = 0o040000;
const UNIX_REGULAR_FILE_TYPE = 0o100000;

/*** Materializes a bounded local source JAR into an isolated temporary project root. */
export async function materializeSourceJarAsync(
  sourcePath: string
): Promise<LocalProjectMaterialization | null> {
  const sourceStats = await getSourceStatsAsync(sourcePath);
  if (sourceStats === null) return null;
  if (!sourceStats.isFile()) return null;

  const temporaryRoot = await mkdtemp(join(tmpdir(), 'atlas-source-jar-'));
  try {
    const zip = await openPromise(sourcePath, {
      autoClose: false,
      lazyEntries: true,
      strictFileNames: true,
      validateEntrySizes: true,
    });
    try {
      if (zip.entryCount > MAX_ENTRY_COUNT) {
        throw new Error('Source JAR contains too many entries.');
      }
      const result = await extractSourceEntriesAsync(zip, temporaryRoot);
      if (!result.hasSourceFile) {
        throw new Error(
          'Unsupported binary JAR input: the archive does not contain analyzable source files.'
        );
      }
    } finally {
      zip.close();
    }
    return {
      rootPath: temporaryRoot,
      projectName: getProjectName(sourcePath),
      cleanupAsync: () => rm(temporaryRoot, { force: true, recursive: true }),
    };
  } catch (error) {
    await rm(temporaryRoot, { force: true, recursive: true });
    throw createSourceJarError(error);
  }
}

/*** Validates and extracts only ordinary archive entries beneath the isolated temporary root. */
async function extractSourceEntriesAsync(
  zip: ZipFile,
  temporaryRoot: string
): Promise<{ readonly hasSourceFile: boolean }> {
  let entryCount = 0;
  let uncompressedSize = 0;
  let hasSourceFile = false;

  for await (const entry of zip.eachEntry()) {
    entryCount += 1;
    if (entryCount > MAX_ENTRY_COUNT) throw new Error('Source JAR contains too many entries.');
    assertSafeArchiveEntry(entry, temporaryRoot);
    uncompressedSize += entry.uncompressedSize;
    if (uncompressedSize > MAX_UNCOMPRESSED_SIZE) {
      throw new Error('Source JAR expands beyond the supported size limit.');
    }
    if (entry.fileName.endsWith('/')) {
      await mkdir(resolveArchiveEntryPath(temporaryRoot, entry.fileName), { recursive: true });
      continue;
    }
    const targetPath = resolveArchiveEntryPath(temporaryRoot, entry.fileName);
    await mkdir(resolve(targetPath, '..'), { recursive: true });
    await pipeline(
      await zip.openReadStreamPromise(entry),
      createWriteStream(targetPath, { flags: 'wx' })
    );
    hasSourceFile ||= SOURCE_FILE_EXTENSION.test(entry.fileName);
  }

  return { hasSourceFile };
}

/*** Rejects archive metadata that could escape the temporary root or require unsupported extraction. */
function assertSafeArchiveEntry(entry: Entry, temporaryRoot: string): void {
  const { fileName: filename } = entry;
  if (
    filename === '' ||
    filename.includes('\\') ||
    isAbsolute(filename) ||
    filename.split('/').some(part => part === '' || part === '.' || part === '..')
  ) {
    throw new Error('Source JAR contains an unsafe entry path.');
  }
  if (entry.isEncrypted() || ![0, 8].includes(entry.compressionMethod)) {
    throw new Error('Source JAR contains an unsupported encrypted or compressed entry.');
  }
  const unixFileType = (entry.externalFileAttributes >>> 16) & UNIX_FILE_TYPE_MASK;
  if (
    unixFileType !== 0 &&
    unixFileType !== UNIX_DIRECTORY_TYPE &&
    unixFileType !== UNIX_REGULAR_FILE_TYPE
  ) {
    throw new Error('Source JAR contains an unsupported link or special entry.');
  }
  resolveArchiveEntryPath(temporaryRoot, filename);
}

/*** Leaves existing directory and missing-path handling to the canonical project-analysis boundary. */
async function getSourceStatsAsync(sourcePath: string) {
  try {
    return await stat(sourcePath);
  } catch {
    return null;
  }
}

/*** Resolves one validated archive entry and proves that it remains inside the temporary root. */
function resolveArchiveEntryPath(temporaryRoot: string, filename: string): string {
  const targetPath = resolve(temporaryRoot, filename);
  const targetRelativePath = relative(temporaryRoot, targetPath);
  if (
    targetRelativePath === '' ||
    targetRelativePath === '..' ||
    targetRelativePath.startsWith(`..${sep}`) ||
    isAbsolute(targetRelativePath)
  ) {
    throw new Error('Source JAR contains an unsafe entry path.');
  }
  return targetPath;
}

/*** Derives display-only project identity without exposing the isolated extraction location. */
function getProjectName(sourcePath: string): string {
  return basename(sourcePath).replace(/\.jar$/iu, '') || '{unknown}';
}

/*** Preserves actionable input errors while hiding host paths and archive implementation details. */
function createSourceJarError(error: unknown): Error {
  if (
    error instanceof Error &&
    (error.message.startsWith('Source JAR') || error.message.startsWith('Unsupported binary JAR'))
  ) {
    return error;
  }
  return new Error('Unsupported local archive input: provide a valid source JAR file.', {
    cause: error,
  });
}
