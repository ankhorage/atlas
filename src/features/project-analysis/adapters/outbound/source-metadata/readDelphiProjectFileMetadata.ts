import path from 'node:path';

import { readTextFileWithinRoot } from '@ankhorage/utility/node/fs';
import { toPortablePath } from '@ankhorage/utility/node/path';

import type { ProjectFileMetadata, ProjectImportMetadata } from '@/types/projectFiles';

/*** Read Delphi file metadata retained by Atlas Tree and audit exports. */
export function readDelphiProjectFileMetadata(
  fullPath: string,
  projectRoot: string,
  imports: readonly ProjectImportMetadata[]
): ProjectFileMetadata {
  const { content, path: resolvedPath } = readTextFileWithinRoot({
    rootPath: projectRoot,
    filePath: fullPath,
  });
  const fileName = path.basename(resolvedPath);

  return {
    className: extractClassName(content, fileName),
    package: extractUnitPath(resolvedPath, projectRoot),
    imports: [...imports],
    path: toPortablePath(path.relative(projectRoot, resolvedPath)),
  };
}

/*** Extract package/unit path from Delphi file structure. */
function extractUnitPath(filePath: string, projectRoot: string): string {
  const relativePath = toPortablePath(path.relative(projectRoot, filePath));
  const dir = path.posix.dirname(relativePath);
  return dir === '.' ? '' : dir.replace(/\//g, '.');
}

/*** Extract the unit/class name retained in audit file metadata. */
function extractClassName(content: string, fileName: string): string {
  const unitMatch = /\bunit\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/i.exec(content);
  if (unitMatch) return unitMatch[1];

  const classMatch = /\bT([A-Za-z_][A-Za-z0-9_]*)\s*=\s*class/i.exec(content);
  if (classMatch) return 'T' + classMatch[1];

  return path.basename(fileName, path.extname(fileName));
}
