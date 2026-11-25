'use client';
import { useEffect } from 'react';

import type { LiveWorkspace } from '@/features/workspace/adapters/inbound/react/useWorkspaceRepositorySelection';
import {
  createBrowserWorkspaceGraphCache,
  createWorkspaceGraphCacheKey,
} from '@/features/workspace/adapters/outbound/browser/createBrowserWorkspaceGraphCache';

/*** Restores a matching successful graph before refreshing its repositories in the background. */
export function useBrowserWorkspaceGraphCache(input: BrowserWorkspaceGraphCacheInput): void {
  const key = createWorkspaceGraphCacheKey(input.source, input.repositoryIds);
  useEffect(() => {
    if (input.source === '' || input.repositoryIds.length === 0) return;
    const cached = createBrowserWorkspaceGraphCache(window.localStorage).load(key);
    if (cached === undefined) return;
    input.setLiveWorkspace(current =>
      current.workspace.ok
        ? current
        : {
            ...current,
            projectName: cached.projectName,
            selectionRequired: false,
            workspace: cached.workspace,
          }
    );
  }, [input, key]);
  useEffect(() => {
    if (!input.workspace.ok || input.source === '' || input.repositoryIds.length === 0) return;
    createBrowserWorkspaceGraphCache(window.localStorage).save({
      key,
      projectName: input.projectName,
      version: 1,
      workspace: input.workspace,
    });
  }, [input.projectName, input.repositoryIds, input.source, input.workspace, key]);
}

interface BrowserWorkspaceGraphCacheInput {
  readonly projectName: string;
  readonly repositoryIds: readonly string[];
  readonly setLiveWorkspace: (
    value: LiveWorkspace | ((current: LiveWorkspace) => LiveWorkspace)
  ) => void;
  readonly source: string;
  readonly workspace: LiveWorkspace['workspace'];
}
