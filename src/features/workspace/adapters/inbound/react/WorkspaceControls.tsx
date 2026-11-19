'use client';
import { Popover } from '@ankhorage/surface/browser';
import { Button } from '@ankhorage/zora/web/button';
import { Surface } from '@ankhorage/zora/web/surface';
import { View } from '@ankhorage/zora/web/view';
import { useEffect, useRef, useState } from 'react';

import {
  applyWorkspacePresentationSettings,
  readWorkspacePresentationSettings,
} from '@/features/workspace/adapters/inbound/react/applyWorkspacePresentationSettings';
import { createWorkspaceDefinition } from '@/features/workspace/adapters/inbound/react/createWorkspaceDefinition';
import { createWorkspaceOpenDetail } from '@/features/workspace/adapters/inbound/react/createWorkspaceOpenDetail';
import type {
  WorkspaceControlsProps,
  WorkspaceMenuProps,
  WorkspaceOpenDetail,
} from '@/features/workspace/adapters/inbound/react/workspaceControlTypes';
import { createBrowserWorkspaceStore } from '@/features/workspace/adapters/outbound/browser/createBrowserWorkspaceStore';
import type { SettingsContextValue } from '@/types/settings';
import type { WorkspaceDefinition } from '@/types/workspace';

/*** Renders browser-local named workspace controls without persisting analyzed repository data. */
export function WorkspaceControls(props: WorkspaceControlsProps) {
  const [definitions, setDefinitions] = useSavedWorkspaceDefinitions();

  return (
    <WorkspaceMenu
      activeWorkspaceId={props.activeWorkspaceId}
      definitions={definitions}
      isDirty={hasUnsavedChanges(
        definitions.find(definition => definition.id === props.activeWorkspaceId),
        props,
        props.settings
      )}
      onDelete={() =>
        deleteWorkspace(
          props.activeWorkspaceId,
          definitions,
          setDefinitions,
          props.onDeleteWorkspace
        )
      }
      onOpen={workspace => openWorkspace(workspace, props.settings, props.onOpenWorkspace)}
      onRename={() => renameWorkspace(props.activeWorkspaceId, definitions, setDefinitions)}
      onSave={saveAs =>
        saveWorkspace(saveAs, props, props.settings, definitions, setDefinitions, workspace =>
          openWorkspace(workspace, props.settings, props.onOpenWorkspace)
        )
      }
    />
  );
}

/*** Restores an active workspace's presentation even while its controls are in a closed dialog. */
export function WorkspaceSettingsRestore({
  activeWorkspaceId,
  settings,
}: {
  readonly activeWorkspaceId?: string;
  readonly settings: SettingsContextValue;
}) {
  const [definitions] = useSavedWorkspaceDefinitions();
  useWorkspaceSettingsRestore(activeWorkspaceId, definitions, settings);
  return null;
}

/*** Compare the staged source and presentation values with the active saved configuration only. */
function hasUnsavedChanges(
  workspace: WorkspaceDefinition | undefined,
  props: WorkspaceControlsProps,
  settings: SettingsContextValue
): boolean {
  if (workspace === undefined) return false;
  const current = createWorkspaceDefinition({
    ...workspace,
    repositories: props.repositories,
    selectedIds: props.selectedIds,
    settings: readWorkspacePresentationSettings(settings),
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
  settings: SettingsContextValue
) {
  const restoredWorkspaceId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (activeWorkspaceId === undefined || restoredWorkspaceId.current === activeWorkspaceId)
      return;
    const workspace = definitions.find(definition => definition.id === activeWorkspaceId);
    if (workspace === undefined) return;
    restoredWorkspaceId.current = workspace.id;
    applyWorkspacePresentationSettings(settings, workspace.settings);
  }, [activeWorkspaceId, definitions, settings]);
}
/*** Keeps the compact workspace popover purely presentational. */
function WorkspaceMenu(props: WorkspaceMenuProps) {
  return (
    <Popover
      placement="bottom-end"
      anchor={({ toggle }) => (
        <Button accessibilityLabel="Manage workspaces" size="s" variant="outline" onPress={toggle}>
          Workspace
        </Button>
      )}
    >
      <Surface style={{ padding: 8 }} variant="raised">
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
      </Surface>
    </Popover>
  );
}
/*** Groups workspace mutations without widening the compact selector's responsibility. */
function WorkspaceActions(props: WorkspaceMenuProps) {
  return (
    <View direction="row" gap="xs" style={{ marginTop: 8 }} wrap="wrap">
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
  settings: SettingsContextValue,
  definitions: readonly WorkspaceDefinition[],
  setDefinitions: (definitions: readonly WorkspaceDefinition[]) => void,
  open: (workspace: WorkspaceDefinition) => void
): void {
  const name = window.prompt(saveAs ? 'Save workspace as' : 'Workspace name');
  if (name === null || name.trim() === '') return;
  const existing = definitions.find(definition => definition.id === props.activeWorkspaceId);
  const workspace = createWorkspaceDefinition({
    id: saveAs || existing === undefined ? createWorkspaceId(name, definitions) : existing.id,
    name: name.trim(),
    repositories: props.repositories,
    selectedIds: props.selectedIds,
    settings: readWorkspacePresentationSettings(settings),
    source: props.source,
  });
  if (workspace === null)
    return window.alert('Enter a GitHub owner or repository before saving a workspace.');
  setDefinitions(
    createBrowserWorkspaceStore(window.localStorage).apply({ kind: 'save', workspace })
  );
  open(workspace);
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
  setDefinitions: (definitions: readonly WorkspaceDefinition[]) => void,
  onDelete: () => void
): void {
  const current = definitions.find(definition => definition.id === activeWorkspaceId);
  if (current === undefined || !window.confirm(`Delete workspace “${current.name}”?`)) return;
  setDefinitions(
    createBrowserWorkspaceStore(window.localStorage).apply({ kind: 'delete', id: current.id })
  );
  window.history.replaceState(null, '', '/');
  onDelete();
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

/*** Apply saved presentation while exposing the portable source policy to the live workspace owner. */
function openWorkspace(
  workspace: WorkspaceDefinition,
  settings: SettingsContextValue,
  onOpenWorkspace: (detail: WorkspaceOpenDetail) => void
): void {
  applyWorkspacePresentationSettings(settings, workspace.settings);
  onOpenWorkspace(createWorkspaceOpenDetail(workspace));
}
