import { materializeGitHubRepositoryAsync } from '@ankhorage/repository/github';

import type { GitHubProjectMaterializer } from '@/types/projectSource';

/*** Adapt the repository package's GitHub materialization capability to Atlas project sources. */
export function createGitHubProjectMaterializer(): GitHubProjectMaterializer {
  return {
    materializeAsync: async (source, signal) => {
      const result = await materializeGitHubRepositoryAsync({ url: source.url, signal });
      return {
        rootPath: result.rootPath,
        projectName: result.repository.name,
        revision: result.revision,
        cleanupAsync: result.cleanupAsync,
      };
    },
  };
}
