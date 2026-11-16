'use client';

import { useZoraTheme } from '@ankhorage/zora/web/runtime';
import { AppShell } from '@ankhorage/zora/web/view';

import type { AuditExportActions } from '@/features/audit/adapters/inbound/react/AuditExportPanel';
import { useCycleSelection } from '@/features/audit/adapters/inbound/react/useCycleSelection';
import type { GitHubAuthView } from '@/features/github-auth/adapters/inbound/next/readGitHubAuthViewAsync';
import type { WorkspaceSelectionEventDetail } from '@/features/workspace/adapters/inbound/react/ProjectSourceForm';
import { useWorkspaceCycleInspection } from '@/features/workspace/adapters/inbound/react/useWorkspaceCycleInspection';
import { useWorkspaceNavigation } from '@/features/workspace/adapters/inbound/react/useWorkspaceNavigation';
import type { LiveWorkspace } from '@/features/workspace/adapters/inbound/react/useWorkspaceRepositorySelection';
import { WorkspaceHeader } from '@/features/workspace/adapters/inbound/react/WorkspaceHeader';
import { WorkspacePanels } from '@/features/workspace/adapters/inbound/react/WorkspacePanels';
import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';
import type { Audit } from '@/types/audit';
import type { WorkspaceLoadResult, WorkspaceRepositoryLoadStatus } from '@/types/workspace';

/*** Compose the workspace's persistent shell and its graph, inspection, and load-state presentation. */
export function WorkspaceLayout({
  auditExportActions,
  currentSource,
  githubAuth,
  liveWorkspace,
  offline,
  projectName,
  repositories,
  selectionError,
  selectionRequired,
  workspaceScope,
  onRetry,
  onSelection,
}: WorkspaceLayoutProps) {
  const navigation = useWorkspaceNavigation(liveWorkspace.workspace);
  const headerProps = {
    currentSource,
    githubAuth,
    navigation,
    offline,
    projectName,
    repositories,
    selectionRequired,
    workspaceScope,
    onSelection,
  };
  return (
    <AppShell header={<WorkspaceHeaderSlot {...headerProps} />}>
      <WorkspaceMain
        auditExportActions={auditExportActions}
        currentSource={currentSource}
        githubAuth={githubAuth}
        navigation={navigation}
        offline={offline}
        projectName={projectName}
        repositoryStatuses={liveWorkspace.repositoryStatuses}
        selectionError={selectionError}
        selectionRequired={selectionRequired && liveWorkspace.runtimeId === undefined}
        workspace={liveWorkspace.workspace}
        onRetry={onRetry}
      />
    </AppShell>
  );
}

/*** Place the workspace header above graph overlays without mixing header and graph responsibilities. */
function WorkspaceHeaderSlot(props: WorkspaceHeaderSlotProps) {
  return (
    <div style={{ position: 'relative', zIndex: 10 }}>
      <WorkspaceHeader
        currentPackage={props.navigation.currentPackage}
        currentSource={props.currentSource}
        githubAuth={props.githubAuth}
        offline={props.offline}
        projectName={props.projectName}
        projectTree={props.navigation.projectTree}
        repositories={props.repositories}
        selectionRequired={props.selectionRequired}
        workspaceScope={props.workspaceScope}
        onNavigate={props.navigation.navigateToPackage}
        onSelection={props.onSelection}
      />
    </div>
  );
}

/*** Renders workspace tools, graph content, cycle inspection, and persistent load errors. */
function WorkspaceMain({
  auditExportActions,
  currentSource,
  githubAuth,
  navigation,
  offline,
  projectName,
  repositoryStatuses,
  selectionError,
  selectionRequired,
  workspace,
  onRetry,
}: WorkspaceMainProps) {
  const { theme } = useZoraTheme();
  const auditEvaluation = workspace.ok ? workspace.value.evaluation : null;
  const cycleSelection = useWorkspaceCycleSelection(auditEvaluation, workspace, projectName);
  const cycleInspection = useWorkspaceCycleInspection();
  return (
    <main data-testid="main" style={workspaceMainStyle(theme.semantics.surface.default)}>
      {selectionRequired ? (
        <RepositorySelectionNotice />
      ) : (
        <>
          <WorkspacePanels
            auditExportActions={auditExportActions}
            currentSource={currentSource}
            cycleInspection={cycleInspection}
            cycleSelection={cycleSelection}
            evaluation={auditEvaluation}
            navigation={navigation}
            offline={offline}
            projectError={workspace.ok ? null : workspace.error}
            repositoryStatuses={repositoryStatuses}
            selectionError={selectionError}
            showAnonymousBulkLoginHint={
              githubAuth.status === 'anonymous' && hasIncompleteBulkSelection(repositoryStatuses)
            }
            onRetry={onRetry}
          />
        </>
      )}
    </main>
  );
}

/*** Keep the workspace canvas layout independent from its status and graph content. */
function workspaceMainStyle(backgroundColor: string) {
  return {
    backgroundColor,
    display: 'flex',
    flex: 1,
    flexDirection: 'row' as const,
    minHeight: 0,
    minWidth: 0,
    overflow: 'hidden',
    zIndex: 0,
  };
}

/*** Show the anonymous bulk-selection guidance only while a multiple-repository operation remains incomplete. */
function hasIncompleteBulkSelection(
  statuses: readonly WorkspaceRepositoryLoadStatus[] | undefined
): boolean {
  return (
    (statuses?.length ?? 0) > 1 && statuses?.some(status => status.status !== 'successful') === true
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
      Select one or more repositories to inspect. No repository has been materialized yet.
    </div>
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

interface WorkspaceLayoutProps {
  readonly auditExportActions?: AuditExportActions;
  readonly currentSource?: string;
  readonly githubAuth: GitHubAuthView;
  readonly liveWorkspace: LiveWorkspace;
  readonly offline?: boolean;
  readonly onRetry?: (repositoryId: string) => Promise<void>;
  readonly onSelection: (detail: WorkspaceSelectionEventDetail) => void;
  readonly projectName: string;
  readonly repositories?: readonly WorkspaceRepositoryOption[];
  readonly selectionError?: string;
  readonly selectionRequired?: boolean;
  readonly workspaceScope?: string;
}

interface WorkspaceHeaderSlotProps {
  readonly currentSource?: string;
  readonly githubAuth: GitHubAuthView;
  readonly navigation: ReturnType<typeof useWorkspaceNavigation>;
  readonly offline?: boolean;
  readonly onSelection: (detail: WorkspaceSelectionEventDetail) => void;
  readonly projectName: string;
  readonly repositories?: readonly WorkspaceRepositoryOption[];
  readonly selectionRequired?: boolean;
  readonly workspaceScope?: string;
}

interface WorkspaceMainProps {
  readonly auditExportActions?: AuditExportActions;
  readonly currentSource?: string;
  readonly githubAuth: GitHubAuthView;
  readonly navigation: ReturnType<typeof useWorkspaceNavigation>;
  readonly offline?: boolean;
  readonly onRetry?: (repositoryId: string) => Promise<void>;
  readonly projectName: string;
  readonly repositoryStatuses?: readonly WorkspaceRepositoryLoadStatus[];
  readonly selectionError?: string;
  readonly selectionRequired?: boolean;
  readonly workspace: WorkspaceLoadResult;
}
