import { basename, resolve } from 'node:path';

import type {
  GitHubProjectMaterializer,
  ProjectSource,
  ResolvedProjectSource,
  SourceJarMaterializer,
} from '@/types/projectSource';

/*** Resolve one project source into the filesystem root consumed by the existing analysis pipeline. */
export async function resolveProjectSourceAsync(
  source: ProjectSource,
  github: GitHubProjectMaterializer,
  sourceJar?: SourceJarMaterializer,
  signal?: AbortSignal
): Promise<ResolvedProjectSource> {
  if (source.kind === 'filesystem') {
    const materializedSourceJar = await sourceJar?.materializeAsync(source, signal);
    if (materializedSourceJar !== undefined && materializedSourceJar !== null) {
      return { source, ...materializedSourceJar };
    }
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
