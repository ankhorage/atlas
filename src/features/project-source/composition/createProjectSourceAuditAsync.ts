import { normalizeGitHubRepositoryUrl } from '@ankhorage/utility/url';

import { createAuditAsync } from '@/features/audit/composition/createAuditAsync';
import { parseProjectSource } from '@/features/project-source/application/use-cases/parseProjectSource';
import { loadProjectSourceAsync } from '@/features/project-source/composition/loadProjectSourceAsync';
import type { Audit } from '@/types/audit';
import { parseProjectPath } from '@/utils/parseProjectPath';

/*** Build an audit for the configured local project or a browser-selected GitHub repository. */
export async function createProjectSourceAuditAsync(sourceValue?: string): Promise<Audit> {
  if (sourceValue === undefined || sourceValue.trim() === '') {
    return createAuditAsync(parseProjectPath());
  }

  const source = parseProjectSource(normalizeGitHubRepositoryUrl(sourceValue));
  if (source.kind !== 'github') {
    throw new Error('Browser audit export accepts GitHub repository URLs only.');
  }
  const resolved = await loadProjectSourceAsync(source);
  try {
    return await createAuditAsync(
      resolved.rootPath,
      {},
      {
        projectName: resolved.projectName,
        ...(resolved.revision === undefined
          ? {}
          : {
              source: {
                kind: 'github',
                url: source.url,
                revision: resolved.revision,
              },
            }),
      }
    );
  } finally {
    await resolved.cleanupAsync();
  }
}
