'use client';

import { Button } from '@ankhorage/zora/web/button';
import { Surface } from '@ankhorage/zora/web/surface';
import React from 'react';

import type { AuditExportActions } from '@/features/audit/adapters/inbound/react/AuditExportPanel';
import type { useCycleSelection } from '@/features/audit/adapters/inbound/react/useCycleSelection';
import { MobileWorkspaceTools } from '@/features/workspace/adapters/inbound/react/MobileWorkspaceTools';
import { RepositoryLoadFailures } from '@/features/workspace/adapters/inbound/react/RepositoryLoadFailures';
import type { useWorkspaceCycleInspection } from '@/features/workspace/adapters/inbound/react/useWorkspaceCycleInspection';
import type { useWorkspaceNavigation } from '@/features/workspace/adapters/inbound/react/useWorkspaceNavigation';
import { WorkspaceGraph } from '@/features/workspace/adapters/inbound/react/WorkspaceGraph';
import { WorkspaceSidebar } from '@/features/workspace/adapters/inbound/react/WorkspaceSidebar';
import type { Audit } from '@/types/audit';
import type { WorkspaceRepositoryLoadStatus } from '@/types/workspace';

import styles from './WorkspacePanels.module.css';

/*** Connect sidebar inspection controls to the one graph view without duplicating navigation state. */
export function WorkspacePanels(props: WorkspacePanelsProps) {
  const mobile = useMobileWorkspace();
  const [toolsOpen, setToolsOpen] = React.useState(false);
  const [activeTool, setActiveTool] = React.useState('tree');
  return (
    <>
      {mobile ? null : (
        <WorkspaceSidebar
          activeTool={activeTool}
          auditExportActions={props.auditExportActions}
          currentSource={props.currentSource}
          cycleSelection={props.cycleSelection}
          evaluation={props.evaluation}
          inspectedCycleId={props.cycleInspection.inspection?.id ?? null}
          projectTree={props.navigation.projectTree}
          selectedTreeIds={props.navigation.selectedTreeIds}
          onCycleInspectionChange={props.cycleInspection.change}
          onProjectTreeSelect={props.navigation.selectProjectTreeNode}
          offline={props.offline}
          onToolChange={setActiveTool}
        />
      )}
      <WorkspaceContent
        cycleInspection={props.cycleInspection.inspection}
        cycleEvidenceHidden={props.cycleInspection.hiddenEvidence}
        cycleSelection={props.cycleSelection}
        navigation={props.navigation}
        projectError={props.projectError}
        repositoryStatuses={props.repositoryStatuses}
        selectionError={props.selectionError}
        showAnonymousBulkLoginHint={props.showAnonymousBulkLoginHint}
        onRetry={props.onRetry}
        revealedCycleId={props.cycleInspection.revealedId}
        onCloseInspection={() => props.cycleInspection.change(null)}
        onCycleEvidenceVisibilityChange={props.cycleInspection.setHiddenEvidence}
        onRevealCycle={props.cycleInspection.reveal}
        onOpenTools={() => setToolsOpen(true)}
      />
      <MobileWorkspaceTools
        activeTool={activeTool}
        open={toolsOpen}
        workspacePanels={props}
        onDismiss={() => setToolsOpen(false)}
        onToolChange={setActiveTool}
      />
    </>
  );
}

/*** Mounts the permanent sidebar only when the workspace has room for its desktop split pane. */
function useMobileWorkspace(): boolean {
  return React.useSyncExternalStore(
    subscribeToWorkspaceViewport,
    readMobileWorkspaceViewport,
    readDesktopWorkspaceViewport
  );
}

/*** Reports mobile viewport changes without sharing browser state outside the workspace boundary. */
function subscribeToWorkspaceViewport(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const media = window.matchMedia(MOBILE_WORKSPACE_MEDIA_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

/*** Reads whether the current browser viewport uses the graph-first workspace layout. */
function readMobileWorkspaceViewport(): boolean {
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(MOBILE_WORKSPACE_MEDIA_QUERY).matches;
}

/*** Keeps the server render deterministic until the browser applies its measured viewport. */
function readDesktopWorkspaceViewport(): boolean {
  return false;
}

/*** Renders the graph or the current project-source load error. */
function WorkspaceContent(props: WorkspaceContentProps) {
  return (
    <section
      className={styles.content}
      data-testid="workspace-content"
      style={workspaceContentStyle}
    >
      <div className={styles.toolsControl}>
        <Button
          leadingIcon={{ name: 'options-outline' }}
          size="s"
          variant="outline"
          onPress={props.onOpenTools}
        >
          Tools
        </Button>
      </div>
      <RepositoryLoadStatus
        selectionError={props.selectionError}
        showAnonymousBulkLoginHint={props.showAnonymousBulkLoginHint}
        statuses={props.repositoryStatuses}
        onRetry={props.onRetry}
      />
      {props.projectError !== null ? (
        <WorkspaceError message={props.projectError} />
      ) : (
        <WorkspaceGraph
          currentPackage={props.navigation.currentPackage}
          cycleHighlights={props.cycleSelection.highlights}
          cycleInspection={props.cycleInspection}
          cycleEvidenceHidden={props.cycleEvidenceHidden}
          packageGraph={props.navigation.packageGraph}
          revealedCycleId={props.revealedCycleId}
          selectedGraphNodeIds={props.navigation.selectedGraphNodeIds}
          setCurrentPackage={props.navigation.navigateToPackage}
          onCloseInspection={props.onCloseInspection}
          onCycleEvidenceVisibilityChange={props.onCycleEvidenceVisibilityChange}
          onGraphNodeSelect={props.navigation.selectGraphNode}
          onRevealCycle={props.onRevealCycle}
        />
      )}
    </section>
  );
}

/*** Surface only incomplete repository work while the shared graph remains usable for successful projects. */
function RepositoryLoadStatus({
  selectionError,
  showAnonymousBulkLoginHint,
  statuses,
  onRetry,
}: {
  readonly selectionError?: string;
  readonly showAnonymousBulkLoginHint: boolean;
  readonly statuses: readonly WorkspaceRepositoryLoadStatus[] | undefined;
  readonly onRetry?: (repositoryId: string) => Promise<void>;
}) {
  const summary = repositoryLoadSummary(statuses ?? []);
  const showProgress = summary.pending > 0 || summary.failed > 0 || summary.cancelled > 0;
  if (!hasRepositoryLoadStatus(selectionError, showAnonymousBulkLoginHint, showProgress))
    return null;
  const failures = (statuses ?? []).filter(status => status.status === 'failed');
  return (
    <section aria-label="Repository loading status" role="status" style={repositoryStatusStyle}>
      <Surface style={{ padding: 8 }} variant="raised">
        {selectionError === undefined ? null : <div role="alert">{selectionError}</div>}
        {showProgress ? (
          <div>
            {summary.completed} of {summary.selected} analyzed · {summary.pending} pending ·{' '}
            {summary.successful} successful · {summary.failed} failed · {summary.cancelled}{' '}
            cancelled
          </div>
        ) : null}
        {showAnonymousBulkLoginHint ? (
          <p style={{ margin: 0 }}>
            Sign in with GitHub to analyze many repositories with authenticated GitHub limits.
          </p>
        ) : null}
        <RepositoryLoadFailures failures={failures} onRetry={onRetry} />
      </Surface>
    </section>
  );
}

/*** Avoid an empty overlay while preserving status visibility for errors, progress, and the anonymous limit notice. */
function hasRepositoryLoadStatus(
  selectionError: string | undefined,
  showAnonymousBulkLoginHint: boolean,
  showProgress: boolean
) {
  return selectionError !== undefined || showAnonymousBulkLoginHint || showProgress;
}

const workspaceContentStyle = {
  display: 'flex',
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  position: 'relative' as const,
};

const repositoryStatusStyle = {
  left: 0,
  maxWidth: 'min(100%, 560px)',
  padding: 8,
  pointerEvents: 'auto' as const,
  position: 'absolute' as const,
  top: 0,
  zIndex: 1,
};

/*** Count each selected repository exactly once so pending and cancellation are never presented as failures. */
function repositoryLoadSummary(statuses: readonly WorkspaceRepositoryLoadStatus[]) {
  const counts = statuses.reduce(countRepositoryLoadStatus, initialRepositoryLoadCounts);
  return {
    cancelled: counts.cancelled,
    completed: counts.cancelled + counts.failed + counts.successful,
    failed: counts.failed,
    pending: counts.loading,
    selected: statuses.length,
    successful: counts.successful,
  };
}

/*** Count one repository outcome through its explicit finite status vocabulary. */
function countRepositoryLoadStatus(
  counts: RepositoryLoadCounts,
  { status }: WorkspaceRepositoryLoadStatus
): RepositoryLoadCounts {
  switch (status) {
    case 'cancelled':
      return { ...counts, cancelled: counts.cancelled + 1 };
    case 'failed':
      return { ...counts, failed: counts.failed + 1 };
    case 'loading':
      return { ...counts, loading: counts.loading + 1 };
    case 'successful':
      return { ...counts, successful: counts.successful + 1 };
  }
}

/*** Renders the persistent project-load failure state. */
function WorkspaceError({ message }: { readonly message: string }) {
  return (
    <div
      role="alert"
      style={{
        alignItems: 'center',
        display: 'flex',
        flex: 1,
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <span>Unable to load project: {message}</span>
    </div>
  );
}

export interface WorkspacePanelsProps {
  readonly auditExportActions?: AuditExportActions;
  readonly currentSource?: string;
  readonly cycleInspection: ReturnType<typeof useWorkspaceCycleInspection>;
  readonly cycleSelection: ReturnType<typeof useCycleSelection>;
  readonly evaluation: Audit['evaluation'] | null;
  readonly navigation: ReturnType<typeof useWorkspaceNavigation>;
  readonly offline?: boolean;
  readonly projectError: string | null;
  readonly repositoryStatuses?: readonly WorkspaceRepositoryLoadStatus[];
  readonly selectionError?: string;
  readonly showAnonymousBulkLoginHint: boolean;
  readonly onRetry?: (repositoryId: string) => Promise<void>;
}

interface WorkspaceContentProps {
  readonly cycleInspection: ReturnType<typeof useWorkspaceCycleInspection>['inspection'];
  readonly cycleEvidenceHidden: boolean;
  readonly cycleSelection: ReturnType<typeof useCycleSelection>;
  readonly navigation: ReturnType<typeof useWorkspaceNavigation>;
  readonly projectError: string | null;
  readonly repositoryStatuses?: readonly WorkspaceRepositoryLoadStatus[];
  readonly selectionError?: string;
  readonly revealedCycleId: string | null;
  readonly showAnonymousBulkLoginHint: boolean;
  readonly onCloseInspection: () => void;
  readonly onCycleEvidenceVisibilityChange: (hidden: boolean) => void;
  readonly onOpenTools: () => void;
  readonly onRevealCycle: () => void;
  readonly onRetry?: (repositoryId: string) => Promise<void>;
}

interface RepositoryLoadCounts {
  readonly cancelled: number;
  readonly failed: number;
  readonly loading: number;
  readonly successful: number;
}

const initialRepositoryLoadCounts: RepositoryLoadCounts = {
  cancelled: 0,
  failed: 0,
  loading: 0,
  successful: 0,
};

const MOBILE_WORKSPACE_MEDIA_QUERY = '(max-width: 768px)';
