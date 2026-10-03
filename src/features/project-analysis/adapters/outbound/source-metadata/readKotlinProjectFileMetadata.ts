import path from 'node:path';

import { readTextFileWithinRoot } from '@ankhorage/utility/node/fs';
import { toPortablePath } from '@ankhorage/utility/node/path';

import type { ProjectFileMetadata, ProjectImportMetadata } from '@/types/projectFiles';

/*** Read Kotlin file metadata retained by Atlas Tree and audit exports. */
export function readKotlinProjectFileMetadata(
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
    package: extractPackage(content),
    imports: [...imports],
    path: toPortablePath(path.relative(projectRoot, resolvedPath)),
  };
}

/*** Extract the Kotlin package declaration retained for Tree mapping. */
function extractPackage(content: string): string {
  const packageMatch = /^\s*package\s+([\w.]+)/m.exec(content);
  return packageMatch?.[1] ?? '';
}

/*** Extract class/object/interface name with filename fallback. */
function extractClassName(content: string, fileName: string): string {
  const classMatch =
    /(?:^|\n)\s*(?:data\s+|sealed\s+|abstract\s+|open\s+)?(?:class|object|interface)\s+([A-Za-z0-9_]+)/m.exec(
      content
    );

  if (classMatch) return classMatch[1];
  return path.basename(fileName, path.extname(fileName));
}
