'use client';

import { Button } from '@ankhorage/zora/web/button';

import type { WorkspaceRepositoryLoadStatus } from '@/types/workspace';

/*** Render retry controls only for the terminal repository failures in the current operation. */
export function RepositoryLoadFailures({
  failures,
  onRetry,
}: {
  readonly failures: readonly WorkspaceRepositoryLoadStatus[];
  readonly onRetry?: (repositoryId: string) => Promise<void>;
}) {
  if (failures.length === 0) return null;
  return (
    <details>
      <summary>{failures.length} repositories failed</summary>
      <div style={{ maxHeight: 240, overflowY: 'auto' }}>
        {failures.map(({ description, failure, repository, status }) => (
          <div
            key={repository.id}
            style={{ alignItems: 'center', display: 'flex', gap: 8, paddingBlock: 4 }}
          >
            <span>
              {repository.owner}/{repository.name}: {status}
              {description === undefined ? '' : ` — ${description}`}
              {failure?.stage === undefined ? '' : ` (${failure.stage})`}
              {failure?.correlationId === undefined ? '' : ` [${failure.correlationId}]`}
            </span>
            {onRetry === undefined ? null : (
              <Button size="s" variant="outline" onPress={() => void onRetry(repository.id)}>
                Retry
              </Button>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
