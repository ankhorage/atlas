'use client';
import { AppBar } from '@zora/app-bar';
import { Breadcrumbs } from '@zora/breadcrumbs';
import { Button } from '@zora/button';
import { Card } from '@zora/card';
import { TextInput } from '@zora/text-input';
import { useZoraTheme } from '@zora/ZoraProvider';
import { useState } from 'react';

import { useCycleSelection } from '@/features/audit/adapters/inbound/react/useCycleSelection';
import { SettingsProvider } from '@/features/settings/adapters/inbound/react/SettingsProvider';
import { useWorkspaceNavigation } from '@/features/workspace/adapters/inbound/react/useWorkspaceNavigation';
import { WorkspaceGraph } from '@/features/workspace/adapters/inbound/react/WorkspaceGraph';
import { WorkspaceSidebar } from '@/features/workspace/adapters/inbound/react/WorkspaceSidebar';
import { t } from '@/i18n/i18n';
import type { Audit } from '@/types/audit';
import type { CycleInspection } from '@/types/auditVisualization';
import type { WorkspaceLoadResult } from '@/types/workspace';

/*** Renders the active Atlas workspace through its feature-owned React adapter. */
export function WorkspaceView({ currentSource, projectName, workspace }: WorkspaceViewProps) {
  const navigation = useWorkspaceNavigation(workspace);

  return (
    <>
      <WorkspaceHeader
        currentPackage={navigation.currentPackage}
        currentSource={currentSource}
        projectName={projectName}
        onNavigate={navigation.navigateToPackage}
      />
      <SettingsProvider>
        <WorkspaceBody
          currentSource={currentSource}
          navigation={navigation}
          workspace={workspace}
        />
      </SettingsProvider>
    </>
  );
}

/*** Renders workspace breadcrumbs, source selector, and theme action. */
function WorkspaceHeader(props: WorkspaceHeaderProps) {
  const { mode, setMode } = useZoraTheme();
  const isDark = mode === 'dark';

  return (
    <AppBar
      actions={
        <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
          <ProjectSourceForm currentSource={props.currentSource} />
          <Button
            leadingIcon={{ name: isDark ? 'sunny-outline' : 'moon-outline' }}
            size="s"
            variant="outline"
            onPress={() => setMode(isDark ? 'light' : 'dark')}
          >
            {isDark ? 'Light' : 'Dark'}
          </Button>
        </div>
      }
      safeAreaTop={false}
    >
      <Breadcrumbs
        compact
        items={createBreadcrumbItems(props.projectName, props.currentPackage)}
        separator="›"
        onItemPress={({ id }: { readonly id: string }) => props.onNavigate(id)}
      />
    </AppBar>
  );
}

/*** Navigates the workspace to one GitHub repository source selected through a ZORA text input. */
function ProjectSourceForm(props: ProjectSourceFormProps) {
  const [source, setSource] = useState(props.currentSource ?? '');

  const openSource = () => {
    const normalizedSource = source.trim();
    const params = new URLSearchParams();
    if (normalizedSource !== '') params.set('source', normalizedSource);
    window.location.assign(params.size === 0 ? '/' : `/?${params.toString()}`);
  };

  return (
    <div style={{ alignItems: 'center', display: 'flex', gap: 6 }}>
      <TextInput
        accessibilityLabel="GitHub repository URL"
        placeholder="ankhorage/zora or GitHub URL"
        size="s"
        style={{ minWidth: 280 }}
        value={source}
        onChangeText={setSource}
        onSubmitEditing={openSource}
      />
      <Button size="s" variant="outline" onPress={openSource}>
        Open
      </Button>
    </div>
  );
}

/*** Renders workspace tools, graph content, cycle inspection, and persistent load errors. */
function WorkspaceBody({ currentSource, navigation, workspace }: WorkspaceBodyProps) {
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
        currentSource={currentSource}
        cycleSelection={cycleSelection}
        evaluation={auditEvaluation}
        inspectedCycleId={cycleInspection?.id ?? null}
        projectTree={navigation.projectTree}
        selectedTreeIds={navigation.selectedTreeIds}
        onCycleInspectionChange={setCycleInspection}
        onProjectTreeSelect={navigation.selectProjectTreeNode}
      />
      <WorkspaceContent
        cycleInspection={cycleInspection}
        cycleSelection={cycleSelection}
        navigation={navigation}
        projectError={projectError}
        onCloseInspection={() => setCycleInspection(null)}
      />
    </main>
  );
}

/*** Renders the graph or the current project-source load error. */
function WorkspaceContent(props: WorkspaceContentProps) {
  if (props.projectError !== null) return <WorkspaceError message={props.projectError} />;

  return (
    <WorkspaceGraph
      currentPackage={props.navigation.currentPackage}
      cycleHighlights={props.cycleSelection.highlights}
      cycleInspection={props.cycleInspection}
      packageGraph={props.navigation.packageGraph}
      selectedGraphNodeIds={props.navigation.selectedGraphNodeIds}
      setCurrentPackage={props.navigation.navigateToPackage}
      onCloseInspection={props.onCloseInspection}
      onGraphNodeSelect={props.navigation.selectGraphNode}
    />
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
function createBreadcrumbItems(
  projectName: string,
  currentPackage: string
): readonly BreadcrumbItem[] {
  const packageSegments = normalizeGraphPackage(currentPackage).split('.').filter(Boolean);
  const packageItems = packageSegments.map((label, index) => ({
    id: packageSegments.slice(0, index + 1).join('.'),
    label,
  }));

  return [
    { id: '__project__', label: projectName, disabled: true },
    { id: '', label: t('nav.packages') },
    ...packageItems,
  ];
}

/*** Normalizes navigation paths to the package identity representation used by the graph view. */
function normalizeGraphPackage(path: string): string {
  return path.replaceAll('/', '.').replace(/^\.+|\.+$/g, '');
}

const EMPTY_CYCLES: NonNullable<Audit['evaluation']>['cyclicPackages'] = [];

interface WorkspaceViewProps {
  readonly currentSource?: string;
  readonly projectName: string;
  readonly workspace: WorkspaceLoadResult;
}

interface WorkspaceHeaderProps {
  readonly currentPackage: string;
  readonly currentSource?: string;
  readonly projectName: string;
  readonly onNavigate: (path: string) => void;
}

interface ProjectSourceFormProps {
  readonly currentSource?: string;
}

interface WorkspaceBodyProps {
  readonly currentSource?: string;
  readonly navigation: ReturnType<typeof useWorkspaceNavigation>;
  readonly workspace: WorkspaceLoadResult;
}

interface WorkspaceContentProps {
  readonly cycleInspection: CycleInspection | null;
  readonly cycleSelection: ReturnType<typeof useCycleSelection>;
  readonly navigation: ReturnType<typeof useWorkspaceNavigation>;
  readonly projectError: string | null;
  readonly onCloseInspection: () => void;
}

interface BreadcrumbItem {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
}
