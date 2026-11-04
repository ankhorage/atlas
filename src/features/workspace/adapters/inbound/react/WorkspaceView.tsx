'use client';
import { AppHeader } from '@zora/app-header';
import { Breadcrumbs } from '@zora/breadcrumbs';
import { Button } from '@zora/button';
import { AppShell, View } from '@zora/view';
import { useZoraTheme } from '@zora/ZoraProvider';
import { useRef, useState } from 'react';

import type { AuditExportActions } from '@/features/audit/adapters/inbound/react/AuditExportPanel';
import { useCycleSelection } from '@/features/audit/adapters/inbound/react/useCycleSelection';
import { SettingsProvider } from '@/features/settings/adapters/inbound/react/SettingsProvider';
import { ProjectSourceForm } from '@/features/workspace/adapters/inbound/react/ProjectSourceForm';
import { useWorkspaceCycleInspection } from '@/features/workspace/adapters/inbound/react/useWorkspaceCycleInspection';
import { useWorkspaceNavigation } from '@/features/workspace/adapters/inbound/react/useWorkspaceNavigation';
import { WorkspacePanels } from '@/features/workspace/adapters/inbound/react/WorkspacePanels';
import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';
import type { Audit } from '@/types/audit';
import type { ProjectTreeNode } from '@/types/projectTree';
import type { WorkspaceLoadResult } from '@/types/workspace';
import type { WorkspaceRepositoryLoadStatus } from '@/types/workspace';

/*** Renders the active Atlas workspace through its feature-owned React adapter. */
export function WorkspaceView({
  auditExportActions,
  currentSource,
  offline,
  projectName,
  repositories,
  repositoryStatuses,
  runtimeId,
  workspaceScope,
  workspace,
}: WorkspaceViewProps) {
  const [liveWorkspace, setLiveWorkspace] = useState({ repositoryStatuses, runtimeId, workspace });
  const onRetry = useWorkspaceRepositoryRetry(liveWorkspace, setLiveWorkspace);
  const navigation = useWorkspaceNavigation(liveWorkspace.workspace);
  const settingsScope = workspaceScope ?? resolveWorkspaceProjectIdentity(workspace, projectName);

  return (
    <SettingsProvider workspaceScope={settingsScope}>
      <AppShell
        header={<div aria-hidden style={{ height: 56 }} />}
        overlay={
          <WorkspaceHeader
            currentPackage={navigation.currentPackage}
            currentSource={currentSource}
            offline={offline}
            projectName={projectName}
            projectTree={navigation.projectTree}
            repositories={repositories}
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
          workspace={liveWorkspace.workspace}
          onRetry={onRetry}
        />
      </AppShell>
    </SettingsProvider>
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

/*** Renders workspace breadcrumbs, source selector, and theme action. */
function WorkspaceHeader(props: WorkspaceHeaderProps) {
  const { mode, setMode } = useZoraTheme();

  return (
    <AppHeader
      inverted
      style={{ position: 'relative', zIndex: 4 }}
      actions={
        <View align="center" direction="row" gap="s">
          {props.offline ? (
            <span aria-label="Offline snapshot">Offline snapshot</span>
          ) : (
            <ProjectSourceForm
              activeWorkspaceId={props.workspaceScope}
              currentSource={props.currentSource}
              repositories={props.repositories}
            />
          )}
          <Button
            leadingIcon={{ name: mode === 'dark' ? 'sunny-outline' : 'moon-outline' }}
            size="s"
            variant="outline"
            onPress={() => setMode(mode === 'dark' ? 'light' : 'dark')}
          >
            {mode === 'dark' ? 'Light' : 'Dark'}
          </Button>
        </View>
      }
      safeAreaTop={false}
      subtitle={
        <Breadcrumbs
          compact
          items={createBreadcrumbItems(props.currentPackage, props.projectTree)}
          separator="›"
          onItemPress={({ id }: { readonly id: string }) => props.onNavigate(id)}
        />
      }
      title={props.projectName}
    />
  );
}

/*** Renders workspace tools, graph content, cycle inspection, and persistent load errors. */
function WorkspaceBody({
  auditExportActions,
  currentSource,
  navigation,
  offline,
  projectName,
  repositoryStatuses,
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
    </main>
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

/*** Creates package breadcrumbs from a stable Home root to the active package path. */
function createBreadcrumbItems(
  currentPackage: string,
  projectTree: readonly ProjectTreeNode[]
): readonly BreadcrumbItem[] {
  const repositoryCrumbs = findRepositoryBreadcrumbs(currentPackage, projectTree);
  if (repositoryCrumbs !== null) return repositoryCrumbs;
  const packageSegments = normalizeGraphPackage(currentPackage).split('.').filter(Boolean);
  const packageItems = packageSegments.map((label, index) => ({
    id: packageSegments.slice(0, index + 1).join('.'),
    label,
  }));

  return [{ id: '', label: 'Home', icon: { name: 'home-outline' } }, ...packageItems];
}

/*** Present virtual owner and repository labels without leaking technical graph identities. */
function findRepositoryBreadcrumbs(
  currentPackage: string,
  projectTree: readonly ProjectTreeNode[]
): readonly BreadcrumbItem[] | null {
  const match = projectTree
    .flatMap(owner => (owner.children ?? []).map(repository => ({ owner, repository })))
    .find(
      ({ repository }) =>
        repository.kind === 'virtual' &&
        repository.graphPackage !== '' &&
        (currentPackage === repository.graphPackage ||
          currentPackage.startsWith(`${repository.graphPackage}.`))
    );
  if (match === undefined) return null;

  const remainder = currentPackage
    .slice(match.repository.graphPackage.length)
    .replace(/^\./, '')
    .split('.')
    .filter(segment => segment && segment !== 'module' && segment !== 'package');
  return [
    { id: '', label: 'Home', icon: { name: 'home-outline' } },
    { id: '', label: match.owner.label },
    { id: match.repository.graphPackage, label: match.repository.label },
    ...remainder.map((label, index) => ({
      id: `${match.repository.graphPackage}.${remainder.slice(0, index + 1).join('.')}`,
      label,
    })),
  ];
}

/*** Normalizes navigation paths to the package identity representation used by the graph view. */
function normalizeGraphPackage(path: string): string {
  return path.replaceAll('/', '.').replace(/^\.+|\.+$/g, '');
}

interface WorkspaceViewProps {
  readonly auditExportActions?: AuditExportActions;
  readonly currentSource?: string;
  readonly offline?: boolean;
  readonly projectName: string;
  readonly repositories?: readonly WorkspaceRepositoryOption[];
  readonly repositoryStatuses?: readonly WorkspaceRepositoryLoadStatus[];
  readonly runtimeId?: string;
  readonly workspaceScope?: string;
  readonly workspace: WorkspaceLoadResult;
  readonly onRetry?: (repositoryId: string) => Promise<void>;
}

interface LiveWorkspace {
  readonly repositoryStatuses: readonly WorkspaceRepositoryLoadStatus[] | undefined;
  readonly runtimeId: string | undefined;
  readonly workspace: WorkspaceLoadResult;
}

interface WorkspaceHeaderProps {
  readonly currentPackage: string;
  readonly currentSource?: string;
  readonly offline?: boolean;
  readonly projectName: string;
  readonly projectTree: readonly ProjectTreeNode[];
  readonly repositories?: readonly WorkspaceRepositoryOption[];
  readonly workspaceScope?: string;
  readonly onNavigate: (path: string) => void;
}

interface WorkspaceBodyProps {
  readonly auditExportActions?: AuditExportActions;
  readonly currentSource?: string;
  readonly navigation: ReturnType<typeof useWorkspaceNavigation>;
  readonly offline?: boolean;
  readonly projectName: string;
  readonly repositoryStatuses?: readonly WorkspaceRepositoryLoadStatus[];
  readonly workspace: WorkspaceLoadResult;
  readonly onRetry?: (repositoryId: string) => Promise<void>;
}

interface BreadcrumbItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: { readonly name: string };
}
