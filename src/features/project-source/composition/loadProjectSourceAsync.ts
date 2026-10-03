import { createGitHubProjectMaterializer } from '@/features/project-source/adapters/outbound/repository/createGitHubProjectMaterializer';
import { resolveProjectSourceAsync } from '@/features/project-source/application/use-cases/resolveProjectSourceAsync';
import type { ProjectSource, ResolvedProjectSource } from '@/types/projectSource';

/*** Wire the canonical GitHub repository adapter into project-source resolution. */
export function loadProjectSourceAsync(source: ProjectSource): Promise<ResolvedProjectSource> {
  return resolveProjectSourceAsync(source, createGitHubProjectMaterializer());
}
