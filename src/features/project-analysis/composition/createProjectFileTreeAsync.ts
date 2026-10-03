import path from 'node:path';

import type { DependencyGraph } from '@ankhorage/dependency-graph';
import type { ProjectInspection } from '@ankhorage/project-detector/types';
import { resolveFileSystemPathWithinRoot } from '@ankhorage/utility/node/fs';

import { projectDependencyImportsAsync } from '@/features/dependency-analysis/adapters/outbound/dependency-graph/projectDependencyImportsAsync';
import { readCppProjectFileMetadata } from '@/features/project-analysis/adapters/outbound/source-metadata/readCppProjectFileMetadata';
import { readDelphiProjectFileMetadata } from '@/features/project-analysis/adapters/outbound/source-metadata/readDelphiProjectFileMetadata';
import { readJavaProjectFileMetadata } from '@/features/project-analysis/adapters/outbound/source-metadata/readJavaProjectFileMetadata';
import { readKotlinProjectFileMetadata } from '@/features/project-analysis/adapters/outbound/source-metadata/readKotlinProjectFileMetadata';
import { readPythonProjectFileMetadata } from '@/features/project-analysis/adapters/outbound/source-metadata/readPythonProjectFileMetadata';
import { readTypeScriptProjectFileMetadata } from '@/features/project-analysis/adapters/outbound/source-metadata/readTypeScriptProjectFileMetadata';
import { Language } from '@/types/language';
import type {
  ProjectFileMetadata,
  ProjectFileTree,
  ProjectImportMetadata,
} from '@/types/projectFiles';

interface ReadSourceMetadataInput {
  readonly analysisRootPath: string;
  readonly imports: readonly ProjectImportMetadata[];
  readonly language: Language;
  readonly projectPath: string;
  readonly sourceFile: string;
}

/*** Create the Atlas file tree from canonical inspection and dependency evidence. */
export async function createProjectFileTreeAsync(
  inspection: ProjectInspection,
  dependencyGraph: DependencyGraph,
  language: Language,
  projectPath: string
): Promise<ProjectFileTree> {
  assertSupportedLanguage(language);

  const analysisRoot = analysisRootFor(inspection, language);
  const analysisRootPath = resolveFileSystemPathWithinRoot(projectPath, analysisRoot, {
    allowRoot: true,
  });
  const importsByFile = await importsForLanguageAsync(
    dependencyGraph,
    language,
    projectPath,
    analysisRootPath
  );
  const result = createProjectFileTree();
  const directories = new Map<string, ProjectFileTree>([['', result]]);

  for (const directory of inspection.directories) {
    const relativeDirectory = relativeToAnalysisRoot(directory, analysisRoot);
    if (relativeDirectory === undefined || relativeDirectory === '') continue;
    ensureDirectory(directories, relativeDirectory);
  }

  for (const sourceFile of inspection.files) {
    const relativeFile = relativeToAnalysisRoot(sourceFile, analysisRoot);
    if (
      relativeFile === undefined ||
      relativeFile === '' ||
      !isMetadataSourceFile(relativeFile, language)
    ) {
      continue;
    }

    const fileMetadata = readSourceMetadata({
      analysisRootPath,
      imports: importsByFile.get(relativeFile) ?? [],
      language,
      projectPath,
      sourceFile,
    });
    insertFile(directories, relativeFile, fileMetadata);
  }

  return result;
}

/*** Preserve the established Atlas Tree root while consuming detector-owned source-root evidence. */
function analysisRootFor(inspection: ProjectInspection, language: Language): string {
  if (language === Language.TypeScript) return '.';
  return (
    inspection.detection.languages.find(candidate => candidate.id === String(language))
      ?.sourceRoots[0] ?? '.'
  );
}

/*** Convert one project-relative inventory path to the selected analysis-root-relative path. */
function relativeToAnalysisRoot(inventoryPath: string, analysisRoot: string): string | undefined {
  if (analysisRoot === '.') return inventoryPath;
  if (inventoryPath === analysisRoot) return '';
  const prefix = `${analysisRoot}/`;
  return inventoryPath.startsWith(prefix) ? inventoryPath.slice(prefix.length) : undefined;
}

/*** Create one null-prototype directory and index it by relative path. */
function ensureDirectory(
  directories: Map<string, ProjectFileTree>,
  relativeDirectory: string
): ProjectFileTree {
  const existing = directories.get(relativeDirectory);
  if (existing !== undefined) return existing;

  const separator = relativeDirectory.lastIndexOf('/');
  const parentPath = separator < 0 ? '' : relativeDirectory.slice(0, separator);
  const directoryName = separator < 0 ? relativeDirectory : relativeDirectory.slice(separator + 1);
  const parent = ensureDirectory(directories, parentPath);
  const directory = createProjectFileTree();

  Object.defineProperty(parent, directoryName, {
    configurable: true,
    enumerable: true,
    value: directory,
    writable: true,
  });
  directories.set(relativeDirectory, directory);
  return directory;
}

/*** Insert one file beneath its inventoried relative parent directory. */
function insertFile(
  directories: Map<string, ProjectFileTree>,
  relativeFile: string,
  fileMetadata: ProjectFileMetadata
): void {
  const separator = relativeFile.lastIndexOf('/');
  const parentPath = separator < 0 ? '' : relativeFile.slice(0, separator);
  const fileName = separator < 0 ? relativeFile : relativeFile.slice(separator + 1);
  const parent = ensureDirectory(directories, parentPath);

  Object.defineProperty(parent, fileName, {
    configurable: true,
    enumerable: true,
    value: fileMetadata,
    writable: true,
  });
}

/*** Create a dictionary-shaped Tree node without Object prototype keys. */
function createProjectFileTree(): ProjectFileTree {
  return Object.setPrototypeOf({}, null) as ProjectFileTree;
}

/*** Project canonical dependency evidence into the existing audit/file metadata shape. */
async function importsForLanguageAsync(
  dependencyGraph: DependencyGraph,
  language: Language,
  projectPath: string,
  analysisRootPath: string
): Promise<ReadonlyMap<string, readonly ProjectImportMetadata[]>> {
  switch (language) {
    case Language.TypeScript:
      return projectDependencyImportsAsync(dependencyGraph, projectPath);
    case Language.Java:
    case Language.Cpp:
      return projectDependencyImportsAsync(
        dependencyGraph,
        projectPath,
        analysisRootPath,
        'specifier'
      );
    case Language.Kotlin:
      return projectDependencyImportsAsync(
        dependencyGraph,
        projectPath,
        analysisRootPath,
        'specifier',
        'kotlin-standard-library'
      );
    case Language.Python:
      return projectDependencyImportsAsync(
        dependencyGraph,
        projectPath,
        analysisRootPath,
        'specifier',
        'python-legacy'
      );
    case Language.Delphi:
      return projectDependencyImportsAsync(
        dependencyGraph,
        projectPath,
        analysisRootPath,
        'specifier',
        'delphi-standard-library'
      );
    default:
      return new Map();
  }
}

/*** Read one source file through the language-specific Atlas metadata adapter. */
function readSourceMetadata(input: ReadSourceMetadataInput): ProjectFileMetadata {
  const fullPath = resolveFileSystemPathWithinRoot(input.projectPath, input.sourceFile);
  switch (input.language) {
    case Language.Java:
      return readJavaProjectFileMetadata(fullPath, input.analysisRootPath, input.imports);
    case Language.TypeScript:
      return readTypeScriptProjectFileMetadata(fullPath, input.analysisRootPath, input.imports);
    case Language.Cpp:
      return readCppProjectFileMetadata(fullPath, input.analysisRootPath, input.imports);
    case Language.Python:
      return readPythonProjectFileMetadata(fullPath, input.analysisRootPath, input.imports);
    case Language.Delphi:
      return readDelphiProjectFileMetadata(fullPath, input.analysisRootPath, input.imports);
    case Language.Kotlin:
      return readKotlinProjectFileMetadata(fullPath, input.analysisRootPath, input.imports);
    default:
      throw new Error(`Unsupported parser language: ${input.language}`);
  }
}

/*** Keep Atlas export metadata limited to the source extensions it currently serializes. */
function isMetadataSourceFile(relativeFile: string, language: Language): boolean {
  const extension = path.extname(relativeFile).toLowerCase();
  switch (language) {
    case Language.Java:
      return extension === '.java';
    case Language.TypeScript:
      return extension === '.ts' || extension === '.tsx';
    case Language.Cpp:
      return ['.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx'].includes(extension);
    case Language.Python:
      return extension === '.py';
    case Language.Delphi:
      return ['.pas', '.pp', '.dpr'].includes(extension);
    case Language.Kotlin:
      return extension === '.kt' || extension === '.kts';
    default:
      return false;
  }
}

/*** Fail before metadata projection when Atlas has no compatible export reader. */
function assertSupportedLanguage(language: Language): void {
  if (
    ![
      Language.Java,
      Language.TypeScript,
      Language.Cpp,
      Language.Python,
      Language.Delphi,
      Language.Kotlin,
    ].includes(language)
  ) {
    throw new Error(
      "Supported language is 'Java', 'TypeScript', 'C++', 'Python', 'Delphi' & 'Kotlin'. More to follow."
    );
  }
}
