import path from 'node:path';

import { readTextFileWithinRoot } from '@ankhorage/utility/node/fs';
import { toPortablePath } from '@ankhorage/utility/node/path';

import type { ProjectFileMetadata, ProjectImportMetadata } from '@/types/projectFiles';

/*** Read Python file metadata retained by Atlas Tree and audit exports. */
export function readPythonProjectFileMetadata(
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
    package: extractModulePath(resolvedPath, projectRoot),
    imports: [...imports],
    path: toPortablePath(path.relative(projectRoot, resolvedPath)),
  };
}

/*** Extract the module path retained for Tree mapping. */
function extractModulePath(filePath: string, projectRoot: string): string {
  const relativePath = toPortablePath(path.relative(projectRoot, filePath));
  const parts = relativePath.split('/');
  parts.pop();
  return parts.join('.');
}

/*** Extract class name with filename fallback. */
function extractClassName(content: string, fileName: string): string {
  const classMatch = /^class\s+([A-Za-z0-9_]+)/m.exec(content);
  if (classMatch) return classMatch[1];
  return path.basename(fileName, path.extname(fileName));
}
