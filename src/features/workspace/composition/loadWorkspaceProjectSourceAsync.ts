import type { DependencyGraph } from '@ankhorage/dependency-graph';
import { toErrorMessage } from '@ankhorage/utility/error';
import { normalizeGitHubRepositoryUrl } from '@ankhorage/utility/url';

import { parseProjectSource } from '@/features/project-source/application/use-cases/parseProjectSource';
import { loadProjectSourceAsync } from '@/features/project-source/composition/loadProjectSourceAsync';
import { loadWorkspaceAsync } from '@/features/workspace/composition/loadWorkspaceAsync';
import { resolveWorkspaceStartupSource } from '@/features/workspace/composition/resolveWorkspaceStartupSource';
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
  sourceValue: string | undefined,
  loadDependencyGraphAsync: (projectPath: string) => Promise<DependencyGraph>
): Promise<WorkspaceProjectSourceResult> {
  const startupSource = resolveWorkspaceStartupSource(
    sourceValue,
    process.env.NEXT_PUBLIC_PROJECT_PATH
  );

  if (startupSource.kind === 'filesystem') {
    const projectPath = parseProjectPath();
    return {
      projectName: getProjectName(projectPath),
      workspace: await loadWorkspaceAsync(projectPath, await loadDependencyGraphAsync(projectPath)),
    };
  }

  try {
    const source = parseProjectSource(normalizeGitHubRepositoryUrl(startupSource.source));
    if (source.kind !== 'github') {
      throw new Error('The browser source field accepts GitHub repository URLs only.');
    }
    const resolved = await loadProjectSourceAsync(source);
    try {
      return {
        currentSource: source.url,
        projectName: resolved.projectName,
        workspace: await loadWorkspaceAsync(
          resolved.rootPath,
          await loadDependencyGraphAsync(resolved.rootPath)
        ),
      };
    } finally {
      await resolved.cleanupAsync();
    }
  } catch (error) {
    return {
      currentSource: startupSource.source,
      projectName: '{unknown}',
      workspace: {
        ok: false,
        error: toErrorMessage(error, 'Unable to load GitHub repository.'),
      },
    };
  }
}
