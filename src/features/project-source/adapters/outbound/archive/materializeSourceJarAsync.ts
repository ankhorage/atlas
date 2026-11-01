import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, open, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { type Entry, openPromise, type ZipFile } from 'yauzl';

import type { LocalProjectMaterialization } from '@/types/projectSource';

const MAX_ENTRY_COUNT = 10_000;
const MAX_UNCOMPRESSED_SIZE = 256 * 1024 * 1024;
const SOURCE_FILE_EXTENSION = /\.(?:c|cc|cpp|cxx|dpr|h|hpp|java|js|jsx|kt|kts|pas|py|ts|tsx)$/iu;
const UNIX_FILE_TYPE_MASK = 0o170000;
const UNIX_DIRECTORY_TYPE = 0o040000;
const UNIX_REGULAR_FILE_TYPE = 0o100000;
const ZIP_LOCAL_FILE_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/*** Materializes a bounded local source JAR into an isolated temporary project root. */
export async function materializeSourceJarAsync(
  sourcePath: string
): Promise<LocalProjectMaterialization | null> {
  const sourceStats = await getSourceStatsAsync(sourcePath);
  if (sourceStats === null) return null;
  if (!sourceStats.isFile()) return null;
  if (!isJarPath(sourcePath)) return null;
  await assertZipSignatureAsync(sourcePath);

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
  let declaredUncompressedSize = 0;
  let hasSourceFile = false;
  const archiveEntries = new Map<string, 'directory' | 'file'>();
  const createEntrySizeLimit = createExtractedSizeLimit();

  for await (const entry of zip.eachEntry()) {
    entryCount += 1;
    if (entryCount > MAX_ENTRY_COUNT) throw new Error('Source JAR contains too many entries.');
    const entryKind = assertSafeArchiveEntry(entry, temporaryRoot);
    assertDistinctArchiveEntry(archiveEntries, entry.fileName, entryKind);
    declaredUncompressedSize += entry.uncompressedSize;
    if (declaredUncompressedSize > MAX_UNCOMPRESSED_SIZE) {
      throw new Error('Source JAR expands beyond the supported size limit.');
    }
    if (entryKind === 'directory') {
      await mkdir(resolveArchiveEntryPath(temporaryRoot, entry.fileName), { recursive: true });
      continue;
    }
    const targetPath = resolveArchiveEntryPath(temporaryRoot, entry.fileName);
    await mkdir(resolve(targetPath, '..'), { recursive: true });
    await pipeline(
      await zip.openReadStreamPromise(entry),
      createEntrySizeLimit(),
      createWriteStream(targetPath, { flags: 'wx' })
    );
    hasSourceFile ||= SOURCE_FILE_EXTENSION.test(entry.fileName);
  }

  return { hasSourceFile };
}

/*** Rejects archive metadata that could escape the temporary root or require unsupported extraction. */
function assertSafeArchiveEntry(entry: Entry, temporaryRoot: string): 'directory' | 'file' {
  const { fileName: filename } = entry;
  const entryKind = filename.endsWith('/') ? 'directory' : 'file';
  assertSafeArchiveEntryPath(filename, entryKind);
  assertSupportedArchiveEncoding(entry);
  assertOrdinaryArchiveEntry(entry, entryKind);
  resolveArchiveEntryPath(temporaryRoot, filename);
  return entryKind;
}

/*** Rejects absolute, empty, dot, and backslash paths while allowing one directory suffix slash. */
function assertSafeArchiveEntryPath(filename: string, entryKind: 'directory' | 'file'): void {
  const pathWithoutTrailingSlash = entryKind === 'directory' ? filename.slice(0, -1) : filename;
  if (
    filename === '' ||
    filename.includes('\\') ||
    isAbsolute(filename) ||
    pathWithoutTrailingSlash.split('/').some(part => part === '' || part === '.' || part === '..')
  ) {
    throw new Error('Source JAR contains an unsafe entry path.');
  }
}

/*** Restricts extraction to the ZIP compression methods that the bounded reader can validate. */
function assertSupportedArchiveEncoding(entry: Entry): void {
  if (entry.isEncrypted() || ![0, 8].includes(entry.compressionMethod)) {
    throw new Error('Source JAR contains an unsupported encrypted or compressed entry.');
  }
}

/*** Allows only ordinary files and directories, with metadata consistent with the archive pathname. */
function assertOrdinaryArchiveEntry(entry: Entry, entryKind: 'directory' | 'file'): void {
  const unixFileType = (entry.externalFileAttributes >>> 16) & UNIX_FILE_TYPE_MASK;
  if (
    unixFileType !== 0 &&
    unixFileType !== UNIX_DIRECTORY_TYPE &&
    unixFileType !== UNIX_REGULAR_FILE_TYPE
  ) {
    throw new Error('Source JAR contains an unsupported link or special entry.');
  }
  if (isInconsistentArchiveEntryType(entryKind, unixFileType)) {
    throw new Error('Source JAR contains an inconsistent archive entry type.');
  }
}

/*** Detects conflicting Unix file-type metadata without requiring it from every ZIP producer. */
function isInconsistentArchiveEntryType(
  entryKind: 'directory' | 'file',
  unixFileType: number
): boolean {
  return (
    (entryKind === 'directory' && unixFileType === UNIX_REGULAR_FILE_TYPE) ||
    (entryKind === 'file' && unixFileType === UNIX_DIRECTORY_TYPE)
  );
}

/*** Rejects duplicate targets and file-directory collisions before archive extraction mutates disk. */
function assertDistinctArchiveEntry(
  entries: Map<string, 'directory' | 'file'>,
  filename: string,
  kind: 'directory' | 'file'
): void {
  const path = kind === 'directory' ? filename.slice(0, -1) : filename;
  if (entries.has(path)) throw new Error('Source JAR contains duplicate archive entries.');

  const segments = path.split('/');
  const parentPaths = segments
    .slice(0, -1)
    .map((_, index) => segments.slice(0, index + 1).join('/'));
  if (parentPaths.some(parentPath => entries.get(parentPath) === 'file')) {
    throw new Error('Source JAR contains colliding archive entries.');
  }
  if (kind === 'file' && [...entries.keys()].some(entryPath => entryPath.startsWith(`${path}/`))) {
    throw new Error('Source JAR contains colliding archive entries.');
  }
  entries.set(path, kind);
}

/*** Counts actual decompressed bytes because ZIP metadata cannot be trusted as a size bound. */
function createExtractedSizeLimit(): () => Transform {
  let extractedSize = 0;
  return () =>
    new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        extractedSize += chunk.length;
        if (extractedSize > MAX_UNCOMPRESSED_SIZE) {
          callback(new Error('Source JAR expands beyond the supported size limit.'));
          return;
        }
        callback(null, chunk);
      },
    });
}

/*** Leaves existing directory and missing-path handling to the canonical project-analysis boundary. */
async function getSourceStatsAsync(sourcePath: string) {
  try {
    return await stat(sourcePath);
  } catch {
    return null;
  }
}

/*** Restricts archive handling to an explicit JAR input form before opening a ZIP reader. */
function isJarPath(sourcePath: string): boolean {
  return sourcePath.toLowerCase().endsWith('.jar');
}

/*** Verifies the ZIP local-file signature before allocating an extraction root or parsing an archive. */
async function assertZipSignatureAsync(sourcePath: string): Promise<void> {
  const source = await open(sourcePath, 'r');
  try {
    const header = Buffer.alloc(ZIP_LOCAL_FILE_HEADER.length);
    const { bytesRead } = await source.read(header, 0, header.length, 0);
    if (bytesRead !== ZIP_LOCAL_FILE_HEADER.length || !header.equals(ZIP_LOCAL_FILE_HEADER)) {
      throw new Error('Unsupported local archive input: provide a valid source JAR file.');
    }
  } finally {
    await source.close();
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
