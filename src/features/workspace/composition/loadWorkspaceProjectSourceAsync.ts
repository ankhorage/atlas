import { toErrorMessage } from '@ankhorage/utility/error';

import { parseProjectSource } from '@/features/project-source/application/use-cases/parseProjectSource';
import { loadProjectSourceAsync } from '@/features/project-source/composition/loadProjectSourceAsync';
import { loadWorkspaceAsync } from '@/features/workspace/composition/loadWorkspaceAsync';
import type { WorkspaceLoadResult } from '@/types/workspace';
import { getProjectName } from '@/utils/getProjectName';
import { parseProjectPath } from '@/utils/parseProjectPath';

export interface WorkspaceProjectSourceResult {
  readonly currentRef?: string;
  readonly currentSource?: string;
  readonly projectName: string;
  readonly workspace: WorkspaceLoadResult;
}

/*** Load the configured local project or one GitHub URL supplied by the browser query. */
export async function loadWorkspaceProjectSourceAsync(
  sourceValue?: string,
  ref?: string
): Promise<WorkspaceProjectSourceResult> {
  if (sourceValue === undefined || sourceValue.trim() === '') {
    const projectPath = parseProjectPath();
    return {
      projectName: getProjectName(projectPath),
      workspace: await loadWorkspaceAsync(projectPath),
    };
  }

  try {
    const source = parseProjectSource(sourceValue, ref);
    if (source.kind !== 'github') {
      throw new Error('The browser source field accepts GitHub repository URLs only.');
    }
    const resolved = await loadProjectSourceAsync(source);
    try {
      return {
        currentRef: ref,
        currentSource: source.url,
        projectName: resolved.projectName,
        workspace: await loadWorkspaceAsync(resolved.rootPath),
      };
    } finally {
      await resolved.cleanupAsync();
    }
  } catch (error) {
    return {
      currentRef: ref,
      currentSource: sourceValue,
      projectName: '{unknown}',
      workspace: {
        ok: false,
        error: toErrorMessage(error, 'Unable to load GitHub repository.'),
      },
    };
  }
}
