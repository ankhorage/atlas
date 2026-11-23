'use client';
import type { ColorToneDefinition } from '@ankhorage/zora';
import { useRef, useState } from 'react';

import type { AuditExportActions } from '@/features/audit/adapters/inbound/react/AuditExportPanel';
import type { GitHubAuthView } from '@/features/github-auth/adapters/inbound/next/readGitHubAuthViewAsync';
import { SettingsProvider } from '@/features/settings/adapters/inbound/react/SettingsProvider';
import {
  type LiveWorkspace,
  useWorkspaceRepositorySelection,
} from '@/features/workspace/adapters/inbound/react/useWorkspaceRepositorySelection';
import { WorkspaceLayout } from '@/features/workspace/adapters/inbound/react/WorkspaceLayout';
import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';
import type { WorkspaceLoadResult } from '@/types/workspace';
import type { WorkspaceRepositoryLoadStatus } from '@/types/workspace';

/*** Renders the active Atlas workspace through its feature-owned React adapter. */
export function WorkspaceView({
  auditExportActions,
  currentSource,
  githubAuth = { status: 'anonymous' },
  offline,
  projectName,
  repositories,
  repositoryColorTones,
  repositoryStatuses,
  runtimeId,
  selectionRequired,
  workspaceScope,
  workspace,
}: WorkspaceViewProps) {
  const [liveWorkspace, setLiveWorkspace] = useState<LiveWorkspace>(() =>
    createLiveWorkspace({
      projectName,
      repositoryStatuses,
      runtimeId,
      selectionRequired,
      workspace,
    })
  );
  const selection = useWorkspaceRepositorySelection(
    currentSource,
    selectedRepositoryIds(repositories),
    liveWorkspace,
    setLiveWorkspace
  );
  const onRetry = useWorkspaceRepositoryRetry(liveWorkspace, setLiveWorkspace);
  const activeProjectName = liveWorkspace.projectName;
  const settingsScope =
    workspaceScope ?? resolveWorkspaceProjectIdentity(liveWorkspace.workspace, activeProjectName);
  return renderWorkspace({
    auditExportActions,
    currentSource,
    githubAuth,
    liveWorkspace,
    offline,
    onRetry,
    onSelection: selection,
    projectName: activeProjectName,
    repositories,
    repositoryColorTones,
    settingsScope,
    workspaceScope,
  });
}

/*** Keep the stateful browser coordination separate from the stable rendered workspace shell. */
function renderWorkspace(input: {
  readonly auditExportActions: AuditExportActions | undefined;
  readonly currentSource: string | undefined;
  readonly githubAuth: GitHubAuthView;
  readonly liveWorkspace: LiveWorkspace;
  readonly offline: boolean | undefined;
  readonly onRetry: ((repositoryId: string) => Promise<void>) | undefined;
  readonly onSelection: ReturnType<typeof useWorkspaceRepositorySelection>;
  readonly projectName: string;
  readonly repositories: readonly WorkspaceRepositoryOption[] | undefined;
  readonly repositoryColorTones: readonly ColorToneDefinition[] | undefined;
  readonly settingsScope: string;
  readonly workspaceScope: string | undefined;
}) {
  return (
    <SettingsProvider workspaceScope={input.settingsScope}>
      <WorkspaceLayout
        auditExportActions={input.auditExportActions}
        currentSource={input.currentSource}
        githubAuth={input.githubAuth}
        liveWorkspace={input.liveWorkspace}
        offline={input.offline}
        projectName={input.projectName}
        repositories={input.repositories}
        repositoryColorTones={input.repositoryColorTones}
        selectionError={input.liveWorkspace.error}
        selectionRequired={input.liveWorkspace.selectionRequired === true}
        workspaceScope={input.workspaceScope}
        onRetry={input.onRetry}
        onSelection={input.onSelection}
      />
    </SettingsProvider>
  );
}

/*** Preserve the server's initial selection state before the browser begins incremental updates. */
function createLiveWorkspace(input: {
  readonly projectName: string;
  readonly repositoryStatuses: readonly WorkspaceRepositoryLoadStatus[] | undefined;
  readonly runtimeId: string | undefined;
  readonly selectionRequired: boolean | undefined;
  readonly workspace: WorkspaceLoadResult;
}): LiveWorkspace {
  return {
    projectName: input.projectName,
    repositoryStatuses: input.repositoryStatuses,
    runtimeId: input.runtimeId,
    selectionRequired: input.selectionRequired,
    workspace: input.workspace,
  };
}

/*** Derive the initial server-confirmed selection without persisting a graph or provider payload. */
function selectedRepositoryIds(
  repositories: readonly WorkspaceRepositoryOption[] | undefined
): readonly string[] {
  return (
    repositories?.filter(repository => repository.selected).map(repository => repository.id) ?? []
  );
}

/*** Keep only the most recent retry response eligible to replace the live workspace state. */
function useWorkspaceRepositoryRetry(
  liveWorkspace: LiveWorkspace,
  setLiveWorkspace: (value: LiveWorkspace) => void
): ((repositoryId: string) => Promise<void>) | undefined {
  const latestRetry = useRef(0);
  if (liveWorkspace.runtimeId === undefined) return undefined;
  return repositoryId =>
    retryRepositoryAsync(
      liveWorkspace.runtimeId,
      repositoryId,
      liveWorkspace.projectName,
      latestRetry,
      setLiveWorkspace
    );
}

/*** Request one server-owned repository retry while preserving the live React workspace and selections. */
async function retryRepositoryAsync(
  runtimeId: string | undefined,
  repositoryId: string,
  projectName: string,
  latestRetry: { current: number },
  setLiveWorkspace: (value: LiveWorkspace) => void
): Promise<void> {
  if (runtimeId === undefined) throw new Error('The workspace runtime is unavailable.');
  const requestId = ++latestRetry.current;
  const response = await fetch('/api/workspace/retry', {
    body: JSON.stringify({ repositoryId, runtimeId }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  if (!response.ok) throw new Error('Unable to retry repository.');
  const result: unknown = await response.json();
  if (!isWorkspaceRetryResult(result))
    throw new Error('The repository retry returned an invalid workspace.');
  if (requestId !== latestRetry.current) return;
  setLiveWorkspace({
    projectName,
    repositoryStatuses: result.repositoryStatuses,
    runtimeId: result.runtimeId,
    workspace: result.workspace,
  });
}

/*** Narrow the transport response before it replaces the active browser workspace state. */
function isWorkspaceRetryResult(value: unknown): value is {
  readonly repositoryStatuses: readonly WorkspaceRepositoryLoadStatus[];
  readonly runtimeId: string;
  readonly workspace: WorkspaceLoadResult;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'runtimeId' in value &&
    typeof value.runtimeId === 'string' &&
    'workspace' in value &&
    'repositoryStatuses' in value &&
    Array.isArray(value.repositoryStatuses)
  );
}

/*** Chooses a portable workspace scope even while a failed load renders its persistent error state. */
function resolveWorkspaceProjectIdentity(
  workspace: WorkspaceLoadResult,
  projectName: string
): string {
  return workspace.ok ? workspace.value.projectIdentity : projectName;
}

interface WorkspaceViewProps {
  readonly auditExportActions?: AuditExportActions;
  readonly currentSource?: string;
  readonly githubAuth?: GitHubAuthView;
  readonly offline?: boolean;
  readonly projectName: string;
  readonly repositories?: readonly WorkspaceRepositoryOption[];
  readonly repositoryColorTones?: readonly ColorToneDefinition[];
  readonly repositoryStatuses?: readonly WorkspaceRepositoryLoadStatus[];
  readonly selectionRequired?: boolean;
  readonly runtimeId?: string;
  readonly workspaceScope?: string;
  readonly workspace: WorkspaceLoadResult;
  readonly onRetry?: (repositoryId: string) => Promise<void>;
}
