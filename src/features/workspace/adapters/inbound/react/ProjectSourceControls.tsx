'use client';
import { parseHexColorOrThrow } from '@ankhorage/color-theory';
import { Popover } from '@ankhorage/surface/browser';
import { TONE_PAIR_CATALOG } from '@ankhorage/templates';
import type { ColorPickerSelection, ColorPickerValue } from '@ankhorage/zora';
import { Button } from '@ankhorage/zora/web/button';
import { Checkbox } from '@ankhorage/zora/web/checkbox';
import { ColorPicker } from '@ankhorage/zora/web/color-picker';
import { Surface } from '@ankhorage/zora/web/surface';
import { TextInput } from '@ankhorage/zora/web/text-input';
import { View } from '@ankhorage/zora/web/view';
import { useState } from 'react';

import { repositoryColor } from '@/constants/repositoryColor';
import { WorkspaceControls } from '@/features/workspace/adapters/inbound/react/WorkspaceControls';
import type { WorkspaceOpenDetail } from '@/features/workspace/adapters/inbound/react/workspaceControlTypes';
import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';
import type { SettingsContextValue } from '@/types/settings';

import styles from './WorkspaceHeader.module.css';

/*** Compose the existing repository workflow so desktop and mobile share one staged selection. */
export function ProjectSourceControls({
  initiallyOpen,
  publicOnly,
  sourceForm,
  visibleRepositories,
  onPublicOnlyChange,
}: ProjectSourceControlsProps) {
  return (
    <>
      <TextInput
        accessibilityLabel="GitHub owner"
        placeholder="ankhorage or @me"
        size="s"
        value={sourceForm.source}
        onChangeText={sourceForm.setSource}
      />
      <RepositoryPicker
        repositories={visibleRepositories}
        search={sourceForm.search}
        selectedIds={sourceForm.selectedIds}
        settings={sourceForm.settings}
        selectionSupported={sourceForm.selectionSupported}
        totalCount={sourceForm.repositories.length}
        initiallyOpen={initiallyOpen}
        onDeselectAll={() => sourceForm.setSelectedIds(new Set())}
        onSearchChange={sourceForm.setSearch}
        onSelectAll={() =>
          sourceForm.setSelectedIds(
            new Set(sourceForm.repositories.map(repository => repository.id))
          )
        }
        onSelectionChange={sourceForm.setSelectedIds}
      />
      <SelectionSourceNotice sourceForm={sourceForm} />
      {sourceForm.inventoryError ? <span role="status">{sourceForm.inventoryError}</span> : null}
      <PublicOnlyFilter checked={publicOnly} onChange={onPublicOnlyChange} />
      <RepositoryCopyButton sourceForm={sourceForm} />
      <WorkspaceControl sourceForm={sourceForm} />
    </>
  );
}

/*** Keeps saved-workspace actions in the persistent header settings context. */
function WorkspaceControl({ sourceForm }: { readonly sourceForm: ProjectSourceFormModel }) {
  return (
    <WorkspaceControls
      activeWorkspaceId={sourceForm.activeWorkspaceId}
      repositories={sourceForm.repositories}
      selectedIds={sourceForm.selectedIds}
      settings={sourceForm.settings}
      source={sourceForm.source}
      onDeleteWorkspace={sourceForm.deleteWorkspace}
      onOpenWorkspace={sourceForm.openWorkspace}
    />
  );
}

/*** Explains why a preserved legacy workspace cannot use the single-owner incremental transport. */
function SelectionSourceNotice({ sourceForm }: { readonly sourceForm: ProjectSourceFormModel }) {
  if (sourceForm.selectionSupported || sourceForm.source.trim() === '') return null;
  return (
    <span role="status">
      Repository selection is available for one GitHub owner or @me. This workspace remains
      unchanged.
    </span>
  );
}

/*** Keeps repository visibility filtering separate from GitHub authorization consent. */
function PublicOnlyFilter({
  checked,
  onChange,
}: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <Checkbox
      accessibilityLabel="Public only"
      checked={checked}
      className={styles.publicOnly}
      size="s"
      onCheckedChange={onChange}
    >
      Public only
    </Checkbox>
  );
}

/*** Copies the canonical URLs of the staged repository selection. */
function RepositoryCopyButton({ sourceForm }: { readonly sourceForm: ProjectSourceFormModel }) {
  return (
    <Button
      accessibilityLabel="Copy repository links"
      disabled={sourceForm.selectedRepositories.length === 0}
      leadingIcon={{ name: 'copy-outline' }}
      size="s"
      variant="ghost"
      onPress={sourceForm.copyRepositoryLinks}
    >
      Copy
    </Button>
  );
}

interface ProjectSourceControlsProps {
  readonly initiallyOpen?: boolean;
  readonly publicOnly: boolean;
  readonly sourceForm: ProjectSourceFormModel;
  readonly visibleRepositories: readonly WorkspaceRepositoryOption[];
  readonly onPublicOnlyChange: (checked: boolean) => void;
}

interface ProjectSourceFormModel {
  readonly activeWorkspaceId?: string;
  readonly copyRepositoryLinks: () => void;
  readonly deleteWorkspace: () => void;
  readonly inventoryError?: string;
  readonly openWorkspace: (detail: WorkspaceOpenDetail) => void;
  readonly repositories: readonly WorkspaceRepositoryOption[];
  readonly search: string;
  readonly selectedIds: ReadonlySet<string>;
  readonly selectedRepositories: readonly WorkspaceRepositoryOption[];
  readonly selectionSupported: boolean;
  readonly settings: SettingsContextValue;
  readonly setSearch: (search: string) => void;
  readonly setSelectedIds: (ids: Set<string>) => void;
  readonly setSource: (source: string) => void;
  readonly source: string;
}

interface RepositoryPickerProps {
  readonly repositories: readonly WorkspaceRepositoryOption[];
  readonly search: string;
  readonly selectedIds: ReadonlySet<string>;
  readonly settings: SettingsContextValue;
  readonly selectionSupported: boolean;
  readonly totalCount: number;
  readonly initiallyOpen?: boolean;
  readonly onDeselectAll: () => void;
  readonly onSearchChange: (search: string) => void;
  readonly onSelectAll: () => void;
  readonly onSelectionChange: (ids: Set<string>) => void;
}

/*** Renders one searchable multi-select rather than a header action for every repository. */
function RepositoryPicker(props: RepositoryPickerProps) {
  return (
    <Popover
      defaultOpen={props.initiallyOpen}
      placement="bottom-start"
      anchor={({ toggle }) => (
        <Button
          accessibilityLabel="Choose repositories"
          disabled={!props.selectionSupported}
          size="s"
          variant="outline"
          onPress={toggle}
        >
          Repositories ({props.selectedIds.size}/{props.totalCount})
        </Button>
      )}
    >
      <Surface style={REPOSITORY_PICKER_STYLE}>
        <TextInput
          accessibilityLabel="Search repositories"
          placeholder="Search repositories"
          size="s"
          value={props.search}
          onChangeText={props.onSearchChange}
        />
        <View direction="row" gap="xs" style={{ marginBlock: 8 }}>
          <Button size="s" variant="ghost" onPress={props.onSelectAll}>
            Select all
          </Button>
          <Button size="s" variant="ghost" onPress={props.onDeselectAll}>
            Deselect all
          </Button>
        </View>
        <RepositoryChoices {...props} />
      </Surface>
    </Popover>
  );
}

/*** Renders the searchable repository checkbox choices. */
function RepositoryChoices(props: RepositoryPickerProps) {
  if (props.repositories.length === 0) return <span>No repositories match this search.</span>;
  return props.repositories.map(repository => (
    <View className={styles.repositoryChoice} direction="row" key={repository.id}>
      <Checkbox
        accessibilityLabel={`${repository.owner}/${repository.name}`}
        checked={props.selectedIds.has(repository.id)}
        size="s"
        onCheckedChange={(checked: boolean) =>
          props.onSelectionChange(setRepositorySelected(props.selectedIds, repository.id, checked))
        }
      >
        {repository.owner}/{repository.name}
      </Checkbox>
      <RepositoryColorControl
        key={props.settings.repositoryColors[repository.id] ?? repositoryColor.default}
        repository={repository}
        settings={props.settings}
      />
    </View>
  ));
}

/*** Edits one repository's persisted graph color without participating in repository selection. */
function RepositoryColorControl({
  repository,
  settings,
}: {
  readonly repository: WorkspaceRepositoryOption;
  readonly settings: SettingsContextValue;
}) {
  const hasOverride = Object.hasOwn(settings.repositoryColors, repository.id);
  const color = parseHexColorOrThrow(
    hasOverride ? settings.repositoryColors[repository.id] : repositoryColor.default
  );
  const [value, setValue] = useState<ColorPickerValue>(() => createColorPickerValue(color));

  return (
    <Popover
      placement="bottom-start"
      anchor={({ toggle }) => (
        <button
          aria-label={`Change color for ${repository.owner}/${repository.name}`}
          className={styles.repositoryColorSwatch}
          style={{ backgroundColor: color }}
          type="button"
          onClick={toggle}
        />
      )}
    >
      <Surface style={{ padding: 8 }} variant="raised">
        <ColorPicker
          tabs={['wheel', 'tone']}
          testID={`repository-color-picker-${repository.id}`}
          tone={{ selectionMode: 'single', tones: TONE_PAIR_CATALOG }}
          value={value}
          wheel={{}}
          onSelectionChange={(selection: ColorPickerSelection) =>
            setRepositoryColor(settings, repository.id, selection)
          }
          onValueChange={(nextValue: ColorPickerValue) => setValue(nextValue)}
        />
        <Button
          disabled={!hasOverride}
          size="s"
          variant="ghost"
          onPress={() => settings.setRepositoryColor(repository.id, undefined)}
        >
          Reset color
        </Button>
      </Surface>
    </Popover>
  );
}

/*** Create the controlled Wheel and Tone state from the current canonical repository color. */
function createColorPickerValue(color: ColorPickerValue['wheel']['color']): ColorPickerValue {
  return {
    hue: color,
    tab: 'wheel',
    tone: null,
    wheel: { color, harmony: null },
  };
}

/*** Persist the Picker's one active Wheel or single Tone color as a canonical uppercase override. */
function setRepositoryColor(
  settings: SettingsContextValue,
  repositoryId: string,
  selection: ColorPickerSelection
): void {
  const color =
    selection.mode === 'wheel'
      ? selection.value.color
      : selection.mode === 'tone'
        ? selection.value.colors.at(0)
        : undefined;
  if (color !== undefined) settings.setRepositoryColor(repositoryId, color.toUpperCase());
}

/*** Apply the checkbox's resolved selection value to the staged repository identifiers. */
function setRepositorySelected(
  selectedIds: ReadonlySet<string>,
  repositoryId: string,
  checked: boolean
): Set<string> {
  const next = new Set(selectedIds);
  if (checked) next.add(repositoryId);
  else next.delete(repositoryId);
  return next;
}

const REPOSITORY_PICKER_STYLE = {
  maxHeight: 360,
  minWidth: 280,
  overflowY: 'auto',
  padding: 8,
} as const;
