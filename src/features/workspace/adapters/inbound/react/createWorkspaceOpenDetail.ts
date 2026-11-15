import type { WorkspaceOpenDetail } from '@/features/workspace/adapters/inbound/react/workspaceControlTypes';
import type { WorkspaceDefinition } from '@/types/workspace';

/*** Convert a saved workspace definition into browser-local live-workspace navigation detail. */
export function createWorkspaceOpenDetail(workspace: WorkspaceDefinition): WorkspaceOpenDetail {
  const source = workspace.sources
    .map(item => (item.kind === 'github-owner' ? item.owner : item.url))
    .join(',');
  const excludedRepositoryIds = workspace.sources.flatMap(item =>
    item.kind === 'github-owner' ? item.excludedRepositoryIds : []
  );
  const params = new URLSearchParams({ source, workspace: workspace.id });
  if (excludedRepositoryIds.length > 0)
    params.set('source', `${source}|exclude=${excludedRepositoryIds.join(',')}`);
  return {
    excludedRepositoryIds,
    href: `/?${params.toString()}`,
    id: workspace.id,
    source,
  };
}
