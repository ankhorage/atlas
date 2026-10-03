import { materializeGitHubRepositoryAsync } from '@ankhorage/repository/github';

import type { GitHubProjectMaterializer } from '@/types/projectSource';

/*** Adapt Repository's GitHub materialization capability to PKGViz project sources. */
export function createGitHubProjectMaterializer(): GitHubProjectMaterializer {
  return {
    materializeAsync: async source => {
      const result = await materializeGitHubRepositoryAsync({ url: source.url });
      return {
        rootPath: result.rootPath,
        projectName: result.repository.name,
        revision: result.revision,
        cleanupAsync: result.cleanupAsync,
      };
    },
  };
}
