import { inspectProjectAsync } from '@ankhorage/project-detector/node';
import type { ProjectInspection } from '@ankhorage/project-detector/types';

import type { ProjectAnalysisOptions } from '@/types/projectAnalysis';

const PROJECT_PATH_ERROR_CODES: ReadonlySet<string> = new Set(['EACCES', 'ENOENT', 'ENOTDIR']);
const EXCLUDED_ANALYSIS_DIRECTORIES = [
  '@types',
  '.github',
  'examples',
  'test',
  'tests',
  '__tests__',
];
const EXCLUDED_ANALYSIS_FILES = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/*_test.*',
  '**/*_spec.*',
  '**/test_*.*',
  '**/spec_*.*',
];

/*** Inspect one project through the canonical bounded filesystem owner. */
export async function inspectProjectForAnalysisAsync(
  projectPath: string,
  analysisOptions: ProjectAnalysisOptions = {}
): Promise<ProjectInspection> {
  try {
    const inspection = await inspectProjectAsync(projectPath, {
      excludeDirectories: EXCLUDED_ANALYSIS_DIRECTORIES,
      excludeFiles: EXCLUDED_ANALYSIS_FILES,
      excludePaths: analysisOptions.excludePaths,
    });
    if (!inspection.complete) {
      throw new Error(
        `Project inspection is incomplete: ${inspection.diagnostics
          .map(diagnostic => diagnostic.message)
          .join('; ')}`
      );
    }
    return inspection;
  } catch (error) {
    if (!isProjectPathUnavailableError(error)) throw error;

    const projectPathError = new Error(`Invalid or unavailable project path: ${projectPath}`, {
      cause: error,
    });
    projectPathError.name = 'ProjectPathUnavailableError';
    throw projectPathError;
  }
}

/*** Identify filesystem errors that mean the configured inspection root cannot be used. */
function isProjectPathUnavailableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    PROJECT_PATH_ERROR_CODES.has(error.code)
  );
}
