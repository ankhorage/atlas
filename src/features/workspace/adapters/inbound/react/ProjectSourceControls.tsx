'use client';
import { Popover } from '@ankhorage/surface/browser';
import type { ColorToneDefinition } from '@ankhorage/zora';
import { Button } from '@ankhorage/zora/web/button';
import { Checkbox } from '@ankhorage/zora/web/checkbox';
import { IconButton } from '@ankhorage/zora/web/icon-button';
import { Surface } from '@ankhorage/zora/web/surface';
import { TextInput } from '@ankhorage/zora/web/text-input';
import { View } from '@ankhorage/zora/web/view';

import { RepositoryColorControl } from '@/features/workspace/adapters/inbound/react/RepositoryColorControl';
import { WorkspaceControls } from '@/features/workspace/adapters/inbound/react/WorkspaceControls';
import type { WorkspaceOpenDetail } from '@/features/workspace/adapters/inbound/react/workspaceControlTypes';
import { isWorkspaceSelectionSource } from '@/features/workspace/application/use-cases/isWorkspaceSelectionSource';
import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';
import type { SettingsContextValue } from '@/types/settings';

/*** Compose the existing repository workflow so desktop and mobile share one staged selection. */
export function ProjectSourceControls({
  initiallyOpen,
  showSelectionNotice = true,
  sourceForm,
  visibleRepositories,
  onWorkspaceOpenChange,
  workspaceOpen,
}: ProjectSourceControlsProps) {
  return (
    <>
      <TextInput
        accessibilityLabel="GitHub owner"
        placeholder="@me or GitHub owner"
        size="s"
        value={sourceForm.source}
        onChangeText={source => {
          if (isGitHubSourceInput(source)) sourceForm.setSource(source);
        }}
      />
      <SourceRepositoryPicker
        initiallyOpen={initiallyOpen}
        sourceForm={sourceForm}
        visibleRepositories={visibleRepositories}
      />
      {showSelectionNotice ? <SelectionSourceNotice sourceForm={sourceForm} /> : null}
      {sourceForm.inventoryError ? <span role="status">{sourceForm.inventoryError}</span> : null}
      <RepositoryCopyButton sourceForm={sourceForm} />
      <WorkspaceControl
        sourceForm={sourceForm}
        open={workspaceOpen}
        onOpenChange={onWorkspaceOpenChange}
      />
    </>
  );
}

/*** Connect the reusable picker to the staged source form without widening the header component. */
function SourceRepositoryPicker({
  initiallyOpen,
  sourceForm,
  visibleRepositories,
}: {
  readonly initiallyOpen?: boolean;
  readonly sourceForm: ProjectSourceFormModel;
  readonly visibleRepositories: readonly WorkspaceRepositoryOption[];
}) {
  return (
    <RepositoryPicker
      repositories={visibleRepositories}
      repositoryColorTones={sourceForm.repositoryColorTones}
      search={sourceForm.search}
      selectedIds={sourceForm.selectedIds}
      settings={sourceForm.settings}
      selectionSupported={sourceForm.selectionSupported}
      totalCount={sourceForm.repositories.length}
      initiallyOpen={initiallyOpen}
      onDeselectAll={() => sourceForm.setSelectedIds(new Set())}
      onSearchChange={sourceForm.setSearch}
      onSelectAll={() =>
        sourceForm.setSelectedIds(new Set(sourceForm.repositories.map(repository => repository.id)))
      }
      onSelectionChange={sourceForm.setSelectedIds}
    />
  );
}

/*** Allow GitHub owner input and the transient states required while typing @me. */
function isGitHubSourceInput(value: string): boolean {
  return (
    value === '' ||
    value === '@' ||
    value === '@m' ||
    isWorkspaceSelectionSource(value) ||
    /^[A-Za-z\d](?:[A-Za-z\d-]{0,38})?$/u.test(value)
  );
}

/*** Keeps saved-workspace actions in the persistent header settings context. */
function WorkspaceControl({
  sourceForm,
  open,
  onOpenChange,
}: {
  readonly sourceForm: ProjectSourceFormModel;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  return (
    <WorkspaceControls
      activeWorkspaceId={sourceForm.activeWorkspaceId}
      repositories={sourceForm.repositories}
      selectedIds={sourceForm.selectedIds}
      settings={sourceForm.settings}
      source={sourceForm.source}
      open={open}
      onDeleteWorkspace={sourceForm.deleteWorkspace}
      onOpenWorkspace={sourceForm.openWorkspace}
      onOpenChange={onOpenChange}
    />
  );
}

/*** Explains why a preserved legacy workspace cannot use the single-owner incremental transport. */
function SelectionSourceNotice({ sourceForm }: { readonly sourceForm: ProjectSourceFormModel }) {
  if (sourceForm.selectionSupported || !sourceForm.source.includes(',')) return null;
  return (
    <span role="status">
      Repository selection is available for one GitHub owner or @me. This workspace remains
      unchanged.
    </span>
  );
}

/*** Copies the canonical URLs of the staged repository selection. */
function RepositoryCopyButton({ sourceForm }: { readonly sourceForm: ProjectSourceFormModel }) {
  return (
    <IconButton
      disabled={sourceForm.selectedRepositories.length === 0}
      icon={{ name: 'copy-outline' }}
      label="Copy selected repository links"
      size="s"
      variant="ghost"
      onPress={sourceForm.copyRepositoryLinks}
    />
  );
}

interface ProjectSourceControlsProps {
  readonly initiallyOpen?: boolean;
  readonly showSelectionNotice?: boolean;
  readonly sourceForm: ProjectSourceFormModel;
  readonly visibleRepositories: readonly WorkspaceRepositoryOption[];
  readonly onWorkspaceOpenChange: (open: boolean) => void;
  readonly workspaceOpen: boolean;
}

interface ProjectSourceFormModel {
  readonly activeWorkspaceId?: string;
  readonly copyRepositoryLinks: () => void;
  readonly deleteWorkspace: () => void;
  readonly inventoryError?: string;
  readonly openWorkspace: (detail: WorkspaceOpenDetail) => void;
  readonly repositories: readonly WorkspaceRepositoryOption[];
  readonly repositoryColorTones: readonly ColorToneDefinition[];
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
  readonly repositoryColorTones: readonly ColorToneDefinition[];
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
        <Button disabled={!props.selectionSupported} size="s" variant="outline" onPress={toggle}>
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
    <View align="center" direction="row" justify="space-between" key={repository.id}>
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
        repository={repository}
        repositoryColorTones={props.repositoryColorTones}
        settings={props.settings}
      />
    </View>
  ));
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
