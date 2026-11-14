import {
  createProjectAnalysisSnapshotAsync,
  createSourceGraphFromProjectAnalysisSnapshots,
  projectDependencyGraphFromProjectAnalysisSnapshots,
} from '@ankhorage/dependency-graph';
import type {
  GitHubRepositoryAuthentication,
  GitHubRepositoryDiscoveryRepository,
} from '@ankhorage/repository/github';

import { inspectProjectForAnalysisAsync } from '@/features/project-analysis/adapters/outbound/project-detector/inspectProjectForAnalysisAsync';
import { selectParserLanguage } from '@/features/project-analysis/application/use-cases/selectParserLanguage';
import { createProjectFileTreeAsync } from '@/features/project-analysis/composition/createProjectFileTreeAsync';
import { parseProjectSource } from '@/features/project-source/application/use-cases/parseProjectSource';
import { loadProjectSourceAsync } from '@/features/project-source/composition/loadProjectSourceAsync';
import type { WorkspaceAnalysisCache } from '@/features/workspace/application/use-cases/createWorkspaceAnalysisCache';
import type { RepositoryAnalysis } from '@/features/workspace/composition/composeWorkspaceRepositoryRuntimeResult';
import type { WorkspaceRepositoryRuntimeDependencies } from '@/features/workspace/composition/createWorkspaceRepositoryRuntime';

/*** Resolve, cache, materialize, and analyze one immutable GitHub revision. */
export async function analyzeWorkspaceRepositoryAsync(
  repository: GitHubRepositoryDiscoveryRepository,
  authentication: GitHubRepositoryAuthentication,
  authorizationScope: string,
  cache: WorkspaceAnalysisCache<RepositoryAnalysis>,
  dependencies: WorkspaceRepositoryRuntimeDependencies,
  signal?: AbortSignal
): Promise<RepositoryAnalysis> {
  const revision = await dependencies.resolveRevisionAsync(repository.url, authentication, signal);
  const key = cacheKey(revision, authorizationScope);
  const cached = cache.getAnalysis(key);
  if (cached !== undefined) return cached;
  const source = parseProjectSource(repository.url);
  if (source.kind !== 'github') throw new Error('Workspace repositories must be GitHub sources.');
  const resolved = await (dependencies.materializeAsync ?? loadProjectSourceAsync)(
    { ...source, revision: revision.revision.commitSha },
    signal,
    authentication
  );
  try {
    const inspection = await (dependencies.inspectAsync ?? inspectProjectForAnalysisAsync)(
      resolved.rootPath
    );
    const analysis = await createProjectAnalysisSnapshotAsync({ id: repository.id, inspection });
    const graph = projectDependencyGraphFromProjectAnalysisSnapshots(
      createSourceGraphFromProjectAnalysisSnapshots([analysis]),
      [analysis]
    );
    const language = selectParserLanguage(inspection.detection);
    const value = {
      analysis,
      files: await createProjectFileTreeAsync(
        inspection,
        graph,
        language.language,
        resolved.rootPath
      ),
      language,
    };
    cache.setAnalysis(key, value);
    return value;
  } finally {
    await resolved.cleanupAsync();
  }
}

/*** Scope an immutable analysis to its authorized GitHub identity and resolved revision. */
function cacheKey(
  revision: Awaited<ReturnType<WorkspaceRepositoryRuntimeDependencies['resolveRevisionAsync']>>,
  authorization: string
) {
  return {
    authorization,
    provider: 'github' as const,
    repositoryId: revision.repository.id,
    revision: revision.revision.commitSha,
    schemaVersion: 1,
  };
}
