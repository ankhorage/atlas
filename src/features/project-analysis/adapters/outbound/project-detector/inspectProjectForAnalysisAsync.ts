import { relative } from 'node:path';

import { inspectProjectAsync } from '@ankhorage/project-detector/node';
import type { ProjectDiagnostic, ProjectInspection } from '@ankhorage/project-detector/types';

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
const MANAGED_AGENT_INSTRUCTION_ALIASES: ReadonlySet<string> = new Set(['CLAUDE.md', 'GEMINI.md']);

/*** Inspect one project through the canonical bounded filesystem owner. */
export async function inspectProjectForAnalysisAsync(
  projectPath: string
): Promise<ProjectInspection> {
  try {
    const inspection = removeManagedAgentInstructionDiagnostics(
      await inspectProjectAsync(projectPath, {
        excludeDirectories: EXCLUDED_ANALYSIS_DIRECTORIES,
        excludeFiles: EXCLUDED_ANALYSIS_FILES,
      })
    );
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

/*** Remove only current managed agent-alias symlink diagnostics from project completeness. */
function removeManagedAgentInstructionDiagnostics(
  inspection: ProjectInspection
): ProjectInspection {
  const diagnostics = inspection.diagnostics.filter(
    diagnostic => !isManagedAgentInstructionAliasDiagnostic(diagnostic, inspection.rootPath)
  );
  if (diagnostics.length === inspection.diagnostics.length) return inspection;

  return { ...inspection, complete: diagnostics.length === 0, diagnostics };
}

/*** Identify a root-level Devtools-managed agent instruction alias that is not project source. */
function isManagedAgentInstructionAliasDiagnostic(
  diagnostic: ProjectDiagnostic,
  rootPath: string
): boolean {
  return (
    diagnostic.code === 'symlink-skipped' &&
    typeof diagnostic.path === 'string' &&
    MANAGED_AGENT_INSTRUCTION_ALIASES.has(relative(rootPath, diagnostic.path))
  );
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
