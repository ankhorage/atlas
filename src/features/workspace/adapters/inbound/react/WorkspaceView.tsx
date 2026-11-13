'use client';
import { useZoraTheme } from '@ankhorage/zora/web/runtime';
import { AppShell } from '@ankhorage/zora/web/view';
import { useRef, useState } from 'react';

import type { AuditExportActions } from '@/features/audit/adapters/inbound/react/AuditExportPanel';
import { useCycleSelection } from '@/features/audit/adapters/inbound/react/useCycleSelection';
import type { GitHubAuthView } from '@/features/github-auth/adapters/inbound/next/readGitHubAuthViewAsync';
import { SettingsProvider } from '@/features/settings/adapters/inbound/react/SettingsProvider';
import { useWorkspaceCycleInspection } from '@/features/workspace/adapters/inbound/react/useWorkspaceCycleInspection';
import { useWorkspaceNavigation } from '@/features/workspace/adapters/inbound/react/useWorkspaceNavigation';
import { WorkspaceHeader } from '@/features/workspace/adapters/inbound/react/WorkspaceHeader';
import { WorkspacePanels } from '@/features/workspace/adapters/inbound/react/WorkspacePanels';
import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';
import type { Audit } from '@/types/audit';
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
  repositoryStatuses,
  runtimeId,
  selectionRequired,
  workspaceScope,
  workspace,
}: WorkspaceViewProps) {
  const [liveWorkspace, setLiveWorkspace] = useState({ repositoryStatuses, runtimeId, workspace });
  const onRetry = useWorkspaceRepositoryRetry(liveWorkspace, setLiveWorkspace);
  const navigation = useWorkspaceNavigation(liveWorkspace.workspace);
  const settingsScope =
    workspaceScope ?? resolveWorkspaceProjectIdentity(liveWorkspace.workspace, projectName);
  return (
    <SettingsProvider workspaceScope={settingsScope}>
      <WorkspaceShell
        auditExportActions={auditExportActions}
        currentSource={currentSource}
        githubAuth={githubAuth}
        liveWorkspace={liveWorkspace}
        navigation={navigation}
        offline={offline}
        projectName={projectName}
        repositories={repositories}
        selectionRequired={selectionRequired}
        workspaceScope={workspaceScope}
        onRetry={onRetry}
      />
    </SettingsProvider>
  );
}

/*** Compose the persistent shell separately from the stateful workspace boundary. */
function WorkspaceShell({
  auditExportActions,
  currentSource,
  githubAuth,
  liveWorkspace,
  navigation,
  offline,
  projectName,
  repositories,
  selectionRequired,
  workspaceScope,
  onRetry,
}: WorkspaceShellProps) {
  return (
    <AppShell
      header={<div aria-hidden style={{ height: 56 }} />}
      overlay={
        <WorkspaceHeader
          currentPackage={navigation.currentPackage}
          currentSource={currentSource}
          githubAuth={githubAuth}
          offline={offline}
          projectName={projectName}
          projectTree={navigation.projectTree}
          repositories={repositories}
          selectionRequired={selectionRequired}
          workspaceScope={workspaceScope}
          onNavigate={navigation.navigateToPackage}
        />
      }
    >
      <WorkspaceBody
        currentSource={currentSource}
        auditExportActions={auditExportActions}
        navigation={navigation}
        offline={offline}
        projectName={projectName}
        repositoryStatuses={liveWorkspace.repositoryStatuses}
        selectionRequired={selectionRequired}
        workspace={liveWorkspace.workspace}
        onRetry={onRetry}
      />
    </AppShell>
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
    retryRepositoryAsync(liveWorkspace.runtimeId, repositoryId, latestRetry, setLiveWorkspace);
}

/*** Renders workspace tools, graph content, cycle inspection, and persistent load errors. */
function WorkspaceBody({
  auditExportActions,
  currentSource,
  navigation,
  offline,
  projectName,
  repositoryStatuses,
  selectionRequired,
  workspace,
  onRetry,
}: WorkspaceBodyProps) {
  const { theme } = useZoraTheme();
  const auditEvaluation = workspace.ok ? workspace.value.evaluation : null;
  const projectError = workspace.ok ? null : workspace.error;
  const cycleSelection = useWorkspaceCycleSelection(auditEvaluation, workspace, projectName);
  const cycleInspection = useWorkspaceCycleInspection();

  return (
    <main
      data-testid="main"
      style={{
        backgroundColor: theme.semantics.surface.default,
        display: 'flex',
        flex: 1,
        flexDirection: 'row',
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
        zIndex: 0,
      }}
    >
      {selectionRequired ? (
        <RepositorySelectionNotice />
      ) : (
        <WorkspacePanels
          auditExportActions={auditExportActions}
          currentSource={currentSource}
          cycleInspection={cycleInspection}
          cycleSelection={cycleSelection}
          evaluation={auditEvaluation}
          navigation={navigation}
          offline={offline}
          projectError={projectError}
          repositoryStatuses={repositoryStatuses}
          onRetry={onRetry}
        />
      )}
    </main>
  );
}

/*** Explain the discover-before-open state without representing it as a repository failure. */
function RepositorySelectionNotice() {
  return (
    <div
      role="status"
      style={{
        alignItems: 'center',
        display: 'flex',
        flex: 1,
        justifyContent: 'center',
        padding: 24,
      }}
    >
      Select the repositories to inspect, then choose Open. No repository has been materialized yet.
    </div>
  );
}

/*** Request one server-owned repository retry while preserving the live React workspace and selections. */
async function retryRepositoryAsync(
  runtimeId: string | undefined,
  repositoryId: string,
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

/*** Connects visible cycle evidence to the portable project scope that owns its preferences. */
function useWorkspaceCycleSelection(
  evaluation: Audit['evaluation'] | null,
  workspace: WorkspaceLoadResult,
  projectName: string
) {
  return useCycleSelection(
    evaluation?.cyclicPackages ?? [],
    resolveWorkspaceProjectIdentity(workspace, projectName)
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
  readonly repositoryStatuses?: readonly WorkspaceRepositoryLoadStatus[];
  readonly selectionRequired?: boolean;
  readonly runtimeId?: string;
  readonly workspaceScope?: string;
  readonly workspace: WorkspaceLoadResult;
  readonly onRetry?: (repositoryId: string) => Promise<void>;
}

interface WorkspaceShellProps {
  readonly auditExportActions?: AuditExportActions;
  readonly currentSource?: string;
  readonly githubAuth: GitHubAuthView;
  readonly liveWorkspace: LiveWorkspace;
  readonly navigation: ReturnType<typeof useWorkspaceNavigation>;
  readonly offline?: boolean;
  readonly onRetry?: (repositoryId: string) => Promise<void>;
  readonly projectName: string;
  readonly repositories?: readonly WorkspaceRepositoryOption[];
  readonly selectionRequired?: boolean;
  readonly workspaceScope?: string;
}

interface LiveWorkspace {
  readonly repositoryStatuses: readonly WorkspaceRepositoryLoadStatus[] | undefined;
  readonly runtimeId: string | undefined;
  readonly workspace: WorkspaceLoadResult;
}

interface WorkspaceBodyProps {
  readonly auditExportActions?: AuditExportActions;
  readonly currentSource?: string;
  readonly navigation: ReturnType<typeof useWorkspaceNavigation>;
  readonly offline?: boolean;
  readonly projectName: string;
  readonly repositoryStatuses?: readonly WorkspaceRepositoryLoadStatus[];
  readonly selectionRequired?: boolean;
  readonly workspace: WorkspaceLoadResult;
  readonly onRetry?: (repositoryId: string) => Promise<void>;
}
