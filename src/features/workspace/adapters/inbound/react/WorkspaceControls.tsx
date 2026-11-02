'use client';
import { Button } from '@zora/button';
import { View } from '@zora/view';
import { useEffect, useRef, useState } from 'react';

import { useSettings } from '@/features/settings/adapters/inbound/react/useSettings';
import { createWorkspaceDefinition } from '@/features/workspace/adapters/inbound/react/createWorkspaceDefinition';
import { createBrowserWorkspaceStore } from '@/features/workspace/adapters/outbound/browser/createBrowserWorkspaceStore';
import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';
import type { DependencyFilterKind } from '@/types/settings';
import type { WorkspaceDefinition, WorkspacePresentationSettings } from '@/types/workspace';

/*** Renders browser-local named workspace controls without persisting analyzed repository data. */
export function WorkspaceControls(props: WorkspaceControlsProps) {
  const settings = useSettings();
  const [definitions, setDefinitions] = useSavedWorkspaceDefinitions();
  useWorkspaceSettingsRestore(props.activeWorkspaceId, definitions, settings);
  const activeWorkspace = definitions.find(definition => definition.id === props.activeWorkspaceId);

  return (
    <WorkspaceMenu
      activeWorkspaceId={props.activeWorkspaceId}
      definitions={definitions}
      isDirty={hasUnsavedChanges(activeWorkspace, props, settings)}
      onDelete={() => deleteWorkspace(props.activeWorkspaceId, definitions, setDefinitions)}
      onOpen={openWorkspace}
      onRename={() => renameWorkspace(props.activeWorkspaceId, definitions, setDefinitions)}
      onSave={saveAs => saveWorkspace(saveAs, props, settings, definitions, setDefinitions)}
    />
  );
}

/*** Compare the staged source and presentation values with the active saved configuration only. */
function hasUnsavedChanges(
  workspace: WorkspaceDefinition | undefined,
  props: WorkspaceControlsProps,
  settings: ReturnType<typeof useSettings>
): boolean {
  if (workspace === undefined) return false;
  const current = createWorkspaceDefinition({
    ...workspace,
    repositories: props.repositories,
    selectedIds: props.selectedIds,
    settings: readWorkspaceSettings(settings),
    source: props.source,
  });
  return current === null || JSON.stringify(current) !== JSON.stringify(workspace);
}

/*** Reads browser persistence after hydration, retaining the server's empty initial snapshot. */
function useSavedWorkspaceDefinitions() {
  const [definitions, setDefinitions] = useState<readonly WorkspaceDefinition[]>([]);
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      setDefinitions(createBrowserWorkspaceStore(window.localStorage).load())
    );
    return () => cancelAnimationFrame(frame);
  }, []);
  return [definitions, setDefinitions] as const;
}

/*** Applies a saved presentation definition once when its browser workspace scope becomes active. */
function useWorkspaceSettingsRestore(
  activeWorkspaceId: string | undefined,
  definitions: readonly WorkspaceDefinition[],
  settings: ReturnType<typeof useSettings>
) {
  const restoredWorkspaceId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (activeWorkspaceId === undefined || restoredWorkspaceId.current === activeWorkspaceId)
      return;
    const workspace = definitions.find(definition => definition.id === activeWorkspaceId);
    if (workspace === undefined) return;
    restoredWorkspaceId.current = workspace.id;
    applyWorkspaceSettings(settings, workspace.settings);
  }, [activeWorkspaceId, definitions, settings]);
}

/*** Keeps the compact workspace popover purely presentational. */
function WorkspaceMenu(props: WorkspaceMenuProps) {
  return (
    <details>
      <summary aria-label="Manage workspaces">Workspace</summary>
      <div style={MENU_STYLE}>
        <label>
          Saved workspace{' '}
          <select
            aria-label="Saved workspace"
            value={props.activeWorkspaceId ?? ''}
            onChange={event =>
              openSelectedWorkspace(event.target.value, props.definitions, props.onOpen)
            }
          >
            <option value="">Unsaved workspace</option>
            {props.definitions.map(definition => (
              <option key={definition.id} value={definition.id}>
                {definition.name}
              </option>
            ))}
          </select>
        </label>
        {props.isDirty ? <span aria-live="polite">Unsaved changes</span> : null}
        <WorkspaceActions {...props} />
      </div>
    </details>
  );
}

/*** Groups workspace mutations without widening the compact selector's responsibility. */
function WorkspaceActions(props: WorkspaceMenuProps) {
  return (
    <View direction="row" gap="xs" style={{ marginTop: 8 }}>
      <Button size="s" variant="ghost" onPress={() => props.onSave(false)}>
        Save
      </Button>
      <Button size="s" variant="ghost" onPress={() => props.onSave(true)}>
        Save as
      </Button>
      <Button
        disabled={props.activeWorkspaceId === undefined}
        size="s"
        variant="ghost"
        onPress={props.onRename}
      >
        Rename
      </Button>
      <Button
        disabled={props.activeWorkspaceId === undefined}
        size="s"
        variant="ghost"
        onPress={props.onDelete}
      >
        Delete
      </Button>
    </View>
  );
}

/*** Save the staged source selection under either the active or a newly named workspace. */
function saveWorkspace(
  saveAs: boolean,
  props: WorkspaceControlsProps,
  settings: ReturnType<typeof useSettings>,
  definitions: readonly WorkspaceDefinition[],
  setDefinitions: (definitions: readonly WorkspaceDefinition[]) => void
): void {
  const name = window.prompt(saveAs ? 'Save workspace as' : 'Workspace name');
  if (name === null || name.trim() === '') return;
  const existing = definitions.find(definition => definition.id === props.activeWorkspaceId);
  const workspace = createWorkspaceDefinition({
    id: saveAs || existing === undefined ? createWorkspaceId(name, definitions) : existing.id,
    name: name.trim(),
    repositories: props.repositories,
    selectedIds: props.selectedIds,
    settings: readWorkspaceSettings(settings),
    source: props.source,
  });
  if (workspace === null)
    return window.alert('Enter a GitHub owner or repository before saving a workspace.');
  setDefinitions(
    createBrowserWorkspaceStore(window.localStorage).apply({ kind: 'save', workspace })
  );
  openWorkspace(workspace);
}

/*** Derive a stable readable browser-local id while avoiding collisions with existing definitions. */
function createWorkspaceId(name: string, definitions: readonly WorkspaceDefinition[]): string {
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, 56) || 'workspace';
  return new Set(definitions.map(definition => definition.id)).has(base)
    ? `${base}-${crypto.randomUUID().slice(0, 7)}`
    : base;
}

/*** Rename only the active persisted definition. */
function renameWorkspace(
  activeWorkspaceId: string | undefined,
  definitions: readonly WorkspaceDefinition[],
  setDefinitions: (definitions: readonly WorkspaceDefinition[]) => void
): void {
  const current = definitions.find(definition => definition.id === activeWorkspaceId);
  if (current === undefined) return;
  const name = window.prompt('Rename workspace', current.name);
  if (name === null || name.trim() === '') return;
  setDefinitions(
    createBrowserWorkspaceStore(window.localStorage).apply({
      kind: 'rename',
      id: current.id,
      name: name.trim(),
    })
  );
}

/*** Require confirmation before deleting the active workspace and returning to an unsaved view. */
function deleteWorkspace(
  activeWorkspaceId: string | undefined,
  definitions: readonly WorkspaceDefinition[],
  setDefinitions: (definitions: readonly WorkspaceDefinition[]) => void
): void {
  const current = definitions.find(definition => definition.id === activeWorkspaceId);
  if (current === undefined || !window.confirm(`Delete workspace “${current.name}”?`)) return;
  setDefinitions(
    createBrowserWorkspaceStore(window.localStorage).apply({ kind: 'delete', id: current.id })
  );
  window.location.assign('/');
}

/*** Resolve one selection event through the saved-definition collection. */
function openSelectedWorkspace(
  id: string,
  definitions: readonly WorkspaceDefinition[],
  open: (workspace: WorkspaceDefinition) => void
): void {
  const workspace = definitions.find(definition => definition.id === id);
  if (workspace !== undefined) open(workspace);
}

/*** Capture only presentation controls; immutable analysis data remains outside browser definitions. */
function readWorkspaceSettings(
  settings: ReturnType<typeof useSettings>
): WorkspacePresentationSettings {
  return {
    dependencyPrefix: settings.dependencyPackagePrefix,
    dependencyKinds: [...settings.enabledDependencyKinds].map(toWorkspaceDependencyKind),
    layout: settings.cytoscapeLayout,
    showCompoundNodes: settings.showCompoundNodes,
    showVendorPackages: settings.showVendorPackages,
    spacing: settings.cytoscapeLayoutSpacing,
    subPackageDepth: settings.subPackageDepth,
  };
}

/*** Restore graph settings before navigating so the loaded workspace never reanalyzes for filters. */
function applyWorkspaceSettings(
  settings: ReturnType<typeof useSettings>,
  workspace: WorkspacePresentationSettings
): void {
  settings.setDependencyPackagePrefix(workspace.dependencyPrefix);
  setWorkspaceLayout(settings, workspace.layout);
  settings.setCytoscapeLayoutSpacing(workspace.spacing);
  settings.setSubPackageDepth(workspace.subPackageDepth);
  if (settings.showCompoundNodes !== workspace.showCompoundNodes)
    settings.toggleShowCompoundNodes();
  if (settings.showVendorPackages !== workspace.showVendorPackages)
    settings.toggleShowVendorPackages();
  const enabled = new Set(workspace.dependencyKinds.map(fromWorkspaceDependencyKind));
  for (const kind of ALL_DEPENDENCY_KINDS)
    if (settings.enabledDependencyKinds.has(kind) !== enabled.has(kind))
      settings.toggleDependencyKind(kind);
}

/*** Apply only layouts supported by the current GraphView runtime. */
function setWorkspaceLayout(settings: ReturnType<typeof useSettings>, layout: string): void {
  if (
    layout === 'breadthfirst' ||
    layout === 'circle' ||
    layout === 'concentric' ||
    layout === 'elk' ||
    layout === 'grid'
  )
    settings.setCytoscapeLayout(layout);
}

/*** Encode one settings dependency kind into the portable workspace contract. */
function toWorkspaceDependencyKind(
  kind: DependencyFilterKind
): WorkspacePresentationSettings['dependencyKinds'][number] {
  return kind === 'dependency'
    ? 'runtime'
    : kind === 'devDependency'
      ? 'dev'
      : kind === 'peerDependency'
        ? 'peer'
        : 'optional';
}

/*** Decode one portable dependency kind into the settings adapter vocabulary. */
function fromWorkspaceDependencyKind(
  kind: WorkspacePresentationSettings['dependencyKinds'][number]
): DependencyFilterKind {
  return kind === 'runtime'
    ? 'dependency'
    : kind === 'dev'
      ? 'devDependency'
      : kind === 'peer'
        ? 'peerDependency'
        : 'optionalDependency';
}

/*** Navigate through the canonical server source loader using the workspace's persisted selection. */
function openWorkspace(workspace: WorkspaceDefinition): void {
  const source = workspace.sources
    .map(item => (item.kind === 'github-owner' ? item.owner : item.url))
    .join(',');
  const excluded = workspace.sources.flatMap(item =>
    item.kind === 'github-owner' ? item.excludedRepositoryIds : []
  );
  const params = new URLSearchParams({ source, workspace: workspace.id });
  if (excluded.length > 0) params.set('source', `${source}|exclude=${excluded.join(',')}`);
  window.location.assign(`/?${params.toString()}`);
}

interface WorkspaceControlsProps {
  readonly activeWorkspaceId?: string;
  readonly repositories?: readonly WorkspaceRepositoryOption[];
  readonly selectedIds: ReadonlySet<string>;
  readonly source: string;
}
interface WorkspaceMenuProps {
  readonly activeWorkspaceId?: string;
  readonly definitions: readonly WorkspaceDefinition[];
  readonly isDirty: boolean;
  readonly onDelete: () => void;
  readonly onOpen: (workspace: WorkspaceDefinition) => void;
  readonly onRename: () => void;
  readonly onSave: (saveAs: boolean) => void;
}

const ALL_DEPENDENCY_KINDS: readonly DependencyFilterKind[] = [
  'dependency',
  'devDependency',
  'peerDependency',
  'optionalDependency',
];
const MENU_STYLE = {
  background: 'var(--zora-surface-default, white)',
  border: '1px solid currentColor',
  padding: 8,
  position: 'absolute' as const,
  zIndex: 2,
};
