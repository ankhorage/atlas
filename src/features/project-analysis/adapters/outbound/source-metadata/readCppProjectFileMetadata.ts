import path from 'node:path';

import { readTextFileWithinRoot } from '@ankhorage/utility/node/fs';
import { toPortablePath } from '@ankhorage/utility/node/path';

import type { ProjectFileMetadata, ProjectImportMetadata } from '@/types/projectFiles';

/*** Read C++ file metadata retained by Atlas Tree and audit exports. */
export function readCppProjectFileMetadata(
  fullPath: string,
  projectRoot: string,
  imports: readonly ProjectImportMetadata[]
): ProjectFileMetadata {
  const { content, path: resolvedPath } = readTextFileWithinRoot({
    rootPath: projectRoot,
    filePath: fullPath,
  });
  const fileName = path.basename(resolvedPath);
  const namespace = extractNamespace(content);

  return {
    className: extractClassName(content, fileName),
    package: namespace,
    imports: [...mergeImports(content, namespace, imports)],
    path: toPortablePath(path.relative(projectRoot, resolvedPath)),
  };
}

/*** Extract the first namespace used as Atlas package metadata. */
function extractNamespace(content: string): string {
  const match = /namespace\s+([a-zA-Z0-9_:]+)\s*\{/.exec(content);
  return match?.[1]?.replace(/::/g, '.') ?? '';
}

/*** Retain presentation-only includes that canonical dependency topology intentionally omits. */
function extractPresentationOnlyIncludes(
  content: string,
  namespace: string,
  canonicalImports: readonly ProjectImportMetadata[]
): ProjectImportMetadata[] {
  const canonicalNames = new Set(canonicalImports.map(({ name }) => name));
  const includeRegex = /#include\s+(["<])([^">]+)[">]/g;
  const imports: ProjectImportMetadata[] = [];
  let match;

  while ((match = includeRegex.exec(content)) !== null) {
    const [, delimiter = '', specifier = ''] = match;
    if (canonicalNames.has(specifier)) continue;

    const segments = specifier.replace(/\.(h|hpp|hxx)$/u, '').split('/');
    const pkg = segments.length > 1 ? segments.slice(0, -1).join('.') : '';
    if (pkg !== '' && pkg !== namespace) continue;

    imports.push({
      name: specifier,
      pkg,
      isIntrinsic: delimiter === '"',
    });
  }

  return imports;
}

/*** Restore complete include metadata in source declaration order. */
function mergeImports(
  content: string,
  namespace: string,
  canonicalImports: readonly ProjectImportMetadata[]
): readonly ProjectImportMetadata[] {
  return [
    ...canonicalImports,
    ...extractPresentationOnlyIncludes(content, namespace, canonicalImports),
  ].sort((left, right) => content.indexOf(left.name) - content.indexOf(right.name));
}

/*** Extract a display class/struct name with filename fallback. */
function extractClassName(content: string, fileName: string): string {
  const classMatch = /class\s+([A-Za-z0-9_]+)/.exec(content);
  if (classMatch) return classMatch[1];

  const structMatch = /struct\s+([A-Za-z0-9_]+)/.exec(content);
  if (structMatch) return structMatch[1];

  return path.basename(fileName, path.extname(fileName));
}
