import { normalizeGitHubRepositoryUrl } from '@ankhorage/utility/url';

import type { ProjectSource } from '@/types/projectSource';

/*** Parse one CLI/UI source while sharing canonical GitHub repository normalization. */
export function parseProjectSource(value: string): ProjectSource {
  const source = value.trim();
  if (source === '') throw new Error('Project source must not be empty.');

  try {
    return { kind: 'github', url: normalizeGitHubRepositoryUrl(source) };
  } catch (error) {
    if (source.includes('://') || source.startsWith('github.com/')) {
      throw new Error('Only local project paths and GitHub repository sources are supported.', {
        cause: error,
      });
    }
    return { kind: 'filesystem', path: source };
  }
}
