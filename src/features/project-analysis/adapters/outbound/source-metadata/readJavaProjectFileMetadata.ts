import path from 'node:path';

import { readTextFileWithinRoot } from '@ankhorage/utility/node/fs';
import { toPortablePath } from '@ankhorage/utility/node/path';
import { escapeRegExp } from '@ankhorage/utility/regex';

import type { ProjectFileMetadata, ProjectImportMetadata } from '@/types/projectFiles';

/*** Read Java file metadata retained by Atlas Tree and audit exports. */
export function readJavaProjectFileMetadata(
  fullPath: string,
  projectRoot: string,
  imports: readonly ProjectImportMetadata[]
): ProjectFileMetadata {
  const { content, path: resolvedPath } = readTextFileWithinRoot({
    rootPath: projectRoot,
    filePath: fullPath,
  });
  const fileName = path.basename(resolvedPath, '.java');

  return {
    className: extractClassName(content, fileName),
    package: extractPackageName(content),
    imports: [...imports],
    path: toPortablePath(path.relative(projectRoot, resolvedPath)),
  };
}

/*** Extract the Java package declaration retained for Tree mapping. */
function extractPackageName(content: string): string {
  const match = /^package\s+([a-zA-Z0-9_.]+);/m.exec(content);
  return match?.[1] ?? '';
}

/*** Extract the declaration name retained in audit file metadata. */
function extractClassName(content: string, fileName: string): string {
  const classPattern = new RegExp(
    `(?:public\\s+)?(class|interface|enum|record)\\s+${escapeRegExp(fileName)}\\b`
  );
  const classNameMatch = content.match(classPattern);
  if (classNameMatch) return fileName;

  const fallback = /(?:public\s+)?(class|interface|enum|record)\s+([A-Za-z0-9_]+)/.exec(content);
  return fallback?.[2] ?? '';
}
