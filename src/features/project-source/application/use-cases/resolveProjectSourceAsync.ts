import { basename, resolve } from 'node:path';

import type {
  GitHubProjectMaterializer,
  ProjectSource,
  ResolvedProjectSource,
} from '@/types/projectSource';

/*** Resolve one project source into the filesystem root consumed by the existing analysis pipeline. */
export async function resolveProjectSourceAsync(
  source: ProjectSource,
  github: GitHubProjectMaterializer
): Promise<ResolvedProjectSource> {
  if (source.kind === 'filesystem') {
    return {
      rootPath: resolve(source.path),
      projectName: basename(resolve(source.path)) || '{unknown}',
      source,
      cleanupAsync: () => Promise.resolve(),
    };
  }

  const materialized = await github.materializeAsync(source);
  return {
    rootPath: materialized.rootPath,
    projectName: materialized.projectName,
    revision: materialized.revision,
    source,
    cleanupAsync: materialized.cleanupAsync,
  };
}
