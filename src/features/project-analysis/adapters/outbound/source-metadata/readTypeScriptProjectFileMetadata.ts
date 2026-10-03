import path from 'node:path';

import { readTextFileWithinRoot } from '@ankhorage/utility/node/fs';
import { toPortablePath } from '@ankhorage/utility/node/path';

import type { ProjectFileMetadata, ProjectImportMetadata } from '@/types/projectFiles';

/*** Read TypeScript file metadata retained by Atlas Tree and audit exports. */
export function readTypeScriptProjectFileMetadata(
  fullPath: string,
  projectRoot: string,
  imports: readonly ProjectImportMetadata[]
): ProjectFileMetadata {
  const { content, path: resolvedPath } = readTextFileWithinRoot({
    rootPath: projectRoot,
    filePath: fullPath,
  });
  const relativePath = toPortablePath(path.relative(projectRoot, resolvedPath));
  const segments = relativePath.split('/');

  return {
    className: extractClassName(content, resolvedPath),
    imports: [...imports],
    package: segments.slice(0, -1).join('.'),
    path: relativePath,
  };
}

/*** Extract class name with the existing filename fallback used by audit exports. */
function extractClassName(content: string, fileName: string): string {
  const classMatch = /class\s+(\w+)/.exec(content);
  if (classMatch) return classMatch[1];
  return path.basename(fileName, '.ts');
}
