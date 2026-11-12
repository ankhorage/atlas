'use client';

import { Button } from '@ankhorage/zora/web/button';
import { Card } from '@ankhorage/zora/web/card';
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
  if (props.projectError !== null) return <WorkspaceError message={props.projectError} />;
  return (
    <>
      <RepositoryLoadFailures statuses={props.repositoryStatuses} onRetry={props.onRetry} />
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
    </>
  );
}

/*** Surface only incomplete repository work while the shared graph remains usable for successful projects. */
function RepositoryLoadFailures({
  statuses,
  onRetry,
}: {
  readonly statuses: readonly WorkspaceRepositoryLoadStatus[] | undefined;
  readonly onRetry?: (repositoryId: string) => Promise<void>;
}) {
  const failures = statuses?.filter(status => status.status !== 'successful') ?? [];
  if (failures.length === 0) return null;
  return (
    <section aria-label="Repository loading status" role="status" style={{ padding: 12 }}>
      {failures.map(({ description, repository, status }) => (
        <Card
          compact
          key={repository.id}
          description={description}
          title={`${repository.owner}/${repository.name}: ${status}`}
          tone="outline"
        >
          {status === 'failed' && onRetry !== undefined ? (
            <Button size="s" variant="outline" onPress={() => void onRetry(repository.id)}>
              Retry
            </Button>
          ) : null}
        </Card>
      ))}
    </section>
  );
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
      <Card compact description={message} title="Unable to load project" tone="outline" />
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
  readonly onRetry?: (repositoryId: string) => Promise<void>;
}

interface WorkspaceContentProps {
  readonly cycleInspection: ReturnType<typeof useWorkspaceCycleInspection>['inspection'];
  readonly cycleEvidenceHidden: boolean;
  readonly cycleSelection: ReturnType<typeof useCycleSelection>;
  readonly navigation: ReturnType<typeof useWorkspaceNavigation>;
  readonly projectError: string | null;
  readonly repositoryStatuses?: readonly WorkspaceRepositoryLoadStatus[];
  readonly revealedCycleId: string | null;
  readonly onCloseInspection: () => void;
  readonly onCycleEvidenceVisibilityChange: (hidden: boolean) => void;
  readonly onRevealCycle: () => void;
  readonly onRetry?: (repositoryId: string) => Promise<void>;
}
