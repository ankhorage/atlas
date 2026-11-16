'use client';

import { Button } from '@ankhorage/zora/web/button';
import { Surface } from '@ankhorage/zora/web/surface';
import React from 'react';

import type { AuditExportActions } from '@/features/audit/adapters/inbound/react/AuditExportPanel';
import type { useCycleSelection } from '@/features/audit/adapters/inbound/react/useCycleSelection';
import type { useWorkspaceCycleInspection } from '@/features/workspace/adapters/inbound/react/useWorkspaceCycleInspection';
import type { useWorkspaceNavigation } from '@/features/workspace/adapters/inbound/react/useWorkspaceNavigation';
import { WorkspaceGraph } from '@/features/workspace/adapters/inbound/react/WorkspaceGraph';
import { WorkspaceSidebar } from '@/features/workspace/adapters/inbound/react/WorkspaceSidebar';
import type { Audit } from '@/types/audit';
import type { WorkspaceRepositoryLoadStatus } from '@/types/workspace';

/*** Connect sidebar inspection controls to the one graph view without duplicating navigation state. */
export function WorkspacePanels(props: WorkspacePanelsProps) {
  return (
    <>
      <WorkspaceSidebar
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
      />
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
      />
    </>
  );
}

/*** Renders the graph or the current project-source load error. */
function WorkspaceContent(props: WorkspaceContentProps) {
  return (
    <section data-testid="workspace-content" style={workspaceContentStyle}>
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

/*** Reveal retry controls only for the terminal repository failures in the current operation. */
function RepositoryLoadFailures({
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

interface WorkspacePanelsProps {
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
