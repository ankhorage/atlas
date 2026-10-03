'use client';
import { AppBar } from '@zora/app-bar';
import { Breadcrumbs } from '@zora/breadcrumbs';
import { Button } from '@zora/button';
import { Card } from '@zora/card';
import { useZoraTheme } from '@zora/ZoraProvider';
import { useState } from 'react';

import { useCycleSelection } from '@/features/audit/adapters/inbound/react/useCycleSelection';
import { SettingsProvider } from '@/features/settings/adapters/inbound/react/SettingsProvider';
import { WorkspaceGraph } from '@/features/workspace/adapters/inbound/react/WorkspaceGraph';
import { WorkspaceSidebar } from '@/features/workspace/adapters/inbound/react/WorkspaceSidebar';
import { useWorkspaceNavigation } from '@/features/workspace/adapters/inbound/react/useWorkspaceNavigation';
import { t } from '@/i18n/i18n';
import type { Audit } from '@/types/audit';
import type { CycleInspection } from '@/types/auditVisualization';
import type { WorkspaceLoadResult } from '@/types/workspace';
import { getProjectName } from '@/utils/getProjectName';

/*** Renders the active PKGViz workspace through its feature-owned React adapter. */
export function WorkspaceView({ workspace }: WorkspaceViewProps) {
  const navigation = useWorkspaceNavigation(workspace);

  return (
    <>
      <WorkspaceHeader
        currentPackage={navigation.currentPackage}
        onNavigate={navigation.navigateToPackage}
      />
      <SettingsProvider>
        <WorkspaceBody workspace={workspace} navigation={navigation} />
      </SettingsProvider>
    </>
  );
}

/*** Renders workspace breadcrumbs and the theme action. */
function WorkspaceHeader(props: WorkspaceHeaderProps) {
  const { mode, setMode } = useZoraTheme();
  const isDark = mode === 'dark';

  return (
    <AppBar
      actions={
        <Button
          leadingIcon={{ name: isDark ? 'sunny-outline' : 'moon-outline' }}
          size="s"
          variant="outline"
          onPress={() => setMode(isDark ? 'light' : 'dark')}
        >
          {isDark ? 'Light' : 'Dark'}
        </Button>
      }
      safeAreaTop={false}
    >
      <Breadcrumbs
        compact
        items={createBreadcrumbItems(props.currentPackage)}
        onItemPress={({ id }: { readonly id: string }) => props.onNavigate(id)}
      />
    </AppBar>
  );
}

/*** Renders workspace tools, graph content, cycle inspection, and persistent load errors. */
function WorkspaceBody({ workspace, navigation }: WorkspaceBodyProps) {
  const { theme } = useZoraTheme();
  const auditEvaluation = workspace.ok ? workspace.value.evaluation : null;
  const projectError = workspace.ok ? null : workspace.error;
  const cycleSelection = useCycleSelection(auditEvaluation?.cyclicPackages ?? EMPTY_CYCLES);
  const [cycleInspection, setCycleInspection] = useState<CycleInspection | null>(null);

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
      }}
    >
      <WorkspaceSidebar
        evaluation={auditEvaluation}
        projectTree={navigation.projectTree}
        selectedTreeId={navigation.selectedTreeId}
        onProjectTreeSelect={navigation.selectProjectTreeNode}
        cycleSelection={cycleSelection}
        inspectedCycleId={cycleInspection?.id ?? null}
        onCycleInspectionChange={setCycleInspection}
      />
      {projectError === null ? (
        <WorkspaceGraph
          currentPackage={navigation.currentPackage}
          cycleHighlights={cycleSelection.highlights}
          cycleInspection={cycleInspection}
          packageGraph={navigation.packageGraph}
          selectedGraphNodeId={navigation.selectedGraphNodeId}
          setCurrentPackage={navigation.navigateToPackage}
          onGraphNodeSelect={navigation.selectGraphNode}
          onGraphNodeUnselect={navigation.unselectGraphNode}
          onCloseInspection={() => setCycleInspection(null)}
        />
      ) : (
        <WorkspaceError message={projectError} />
      )}
    </main>
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

/*** Creates interactive package breadcrumbs with a stable project and Packages root. */
function createBreadcrumbItems(currentPackage: string): readonly BreadcrumbItem[] {
  const packageSegments = normalizeGraphPackage(currentPackage).split('.').filter(Boolean);
  const packageItems = packageSegments.map((label, index) => ({
    id: packageSegments.slice(0, index + 1).join('.'),
    label,
  }));

  return [
    { id: '__project__', label: getProjectName(), disabled: true },
    { id: '', label: t('nav.packages'), icon: { name: 'home-outline' } },
    ...packageItems,
  ];
}

/*** Normalizes navigation paths to the package identity representation used by the graph view. */
function normalizeGraphPackage(path: string): string {
  return path.replaceAll('/', '.').replace(/^\.+|\.+$/g, '');
}

const EMPTY_CYCLES: NonNullable<Audit['evaluation']>['cyclicPackages'] = [];

interface WorkspaceViewProps {
  readonly workspace: WorkspaceLoadResult;
}

interface WorkspaceHeaderProps {
  readonly currentPackage: string;
  readonly onNavigate: (path: string) => void;
}

interface WorkspaceBodyProps {
  readonly workspace: WorkspaceLoadResult;
  readonly navigation: ReturnType<typeof useWorkspaceNavigation>;
}

interface BreadcrumbItem {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly icon?: { readonly name: string };
}
