import { toErrorMessage } from '@ankhorage/utility/error';
import { normalizeGitHubRepositoryUrl } from '@ankhorage/utility/url';

import { parseProjectSource } from '@/features/project-source/application/use-cases/parseProjectSource';
import { loadProjectSourceAsync } from '@/features/project-source/composition/loadProjectSourceAsync';
import { loadWorkspaceAsync } from '@/features/workspace/composition/loadWorkspaceAsync';
import type { WorkspaceLoadResult } from '@/types/workspace';
import { getProjectName } from '@/utils/getProjectName';
import { parseProjectPath } from '@/utils/parseProjectPath';

export interface WorkspaceProjectSourceResult {
  readonly currentSource?: string;
  readonly projectName: string;
  readonly workspace: WorkspaceLoadResult;
}

/*** Load the configured local project or one GitHub URL supplied by the browser query. */
export async function loadWorkspaceProjectSourceAsync(
  sourceValue?: string
): Promise<WorkspaceProjectSourceResult> {
  if (sourceValue === undefined || sourceValue.trim() === '') {
    const projectPath = parseProjectPath();
    return {
      projectName: getProjectName(projectPath),
      workspace: await loadWorkspaceAsync(projectPath),
    };
  }

  try {
    const source = parseProjectSource(normalizeGitHubRepositoryUrl(sourceValue));
    if (source.kind !== 'github') {
      throw new Error('The browser source field accepts GitHub repository URLs only.');
    }
    const resolved = await loadProjectSourceAsync(source);
    try {
      return {
        currentSource: source.url,
        projectName: resolved.projectName,
        workspace: await loadWorkspaceAsync(resolved.rootPath),
      };
    } finally {
      await resolved.cleanupAsync();
    }
  } catch (error) {
    return {
      currentSource: sourceValue,
      projectName: '{unknown}',
      workspace: {
        ok: false,
        error: toErrorMessage(error, 'Unable to load GitHub repository.'),
      },
    };
  }
}
