'use client';
import { Popover } from '@ankhorage/surface/browser';
import { Button } from '@ankhorage/zora/web/button';
import { Checkbox } from '@ankhorage/zora/web/checkbox';
import { Surface } from '@ankhorage/zora/web/surface';
import { TextInput } from '@ankhorage/zora/web/text-input';
import { View } from '@ankhorage/zora/web/view';
import { useMemo, useState } from 'react';

import { useBrowserWorkspaceSession } from '@/features/workspace/adapters/inbound/react/useBrowserWorkspaceSession';
import { useProjectSourceFormActions } from '@/features/workspace/adapters/inbound/react/useProjectSourceFormActions';
import { useProjectSourceFormState } from '@/features/workspace/adapters/inbound/react/useProjectSourceFormState';
import { useRepositoryInventory } from '@/features/workspace/adapters/inbound/react/useRepositoryInventory';
import { WorkspaceControls } from '@/features/workspace/adapters/inbound/react/WorkspaceControls';
import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

import styles from './WorkspaceHeader.module.css';

/*** Edits a GitHub source while applying repository selection changes immediately. */
export function ProjectSourceForm(props: ProjectSourceFormProps) {
  const sourceForm = useProjectSourceForm(props);
  const [publicOnly, setPublicOnly] = useState(false);
  const visibleRepositories = useVisibleRepositories(
    sourceForm.repositories,
    sourceForm.search,
    publicOnly
  );

  return (
    <View align="center" className={styles.sourceForm} direction="row" gap="xs">
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
        selectionSupported={sourceForm.selectionSupported}
        totalCount={sourceForm.repositories.length}
        initiallyOpen={props.selectionRequired}
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
      <PublicOnlyFilter checked={publicOnly} onChange={setPublicOnly} />
      <RepositoryCopyButton sourceForm={sourceForm} />
      <WorkspaceControls
        activeWorkspaceId={sourceForm.activeWorkspaceId}
        repositories={sourceForm.repositories}
        selectedIds={sourceForm.selectedIds}
        source={sourceForm.source}
        onDeleteWorkspace={sourceForm.deleteWorkspace}
        onOpenWorkspace={sourceForm.openWorkspace}
      />
    </View>
  );
}

/*** Explains why a preserved legacy workspace cannot use the single-owner incremental transport. */
function SelectionSourceNotice({
  sourceForm,
}: {
  readonly sourceForm: ReturnType<typeof useProjectSourceForm>;
}) {
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
      aria-checked={checked}
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
function RepositoryCopyButton({
  sourceForm,
}: {
  readonly sourceForm: ReturnType<typeof useProjectSourceForm>;
}) {
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

/*** Filters the server-discovered repository inventory without changing staged selection. */
function useVisibleRepositories(
  repositories: readonly WorkspaceRepositoryOption[] | undefined,
  search: string,
  publicOnly: boolean
): readonly WorkspaceRepositoryOption[] {
  return useMemo(
    () =>
      repositories?.filter(
        repository =>
          (!publicOnly || repository.visibility === 'public') &&
          `${repository.owner}/${repository.name}`
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase())
      ) ?? [],
    [publicOnly, repositories, search]
  );
}

/*** Keeps inventory discovery independent from selection-driven workspace changes. */
function useProjectSourceForm(props: ProjectSourceFormProps) {
  const initial = readSource(props.currentSource);
  const state = useProjectSourceFormState(
    initial.owner,
    props.repositories,
    props.activeWorkspaceId
  );
  useBrowserWorkspaceSession({ ...state, onRestoreSelection: props.onSelection });
  const {
    inventoryError,
    inventoryLoaded,
    inventoryOwner,
    repositories: inventory,
    selectionSupported,
  } = useRepositoryInventory(initial.owner, props.repositories, state.source);
  const owner = state.source.trim().toLowerCase();
  const repositories = selectRepositories(inventory, initial.owner, owner, state.selectedIds);
  const selectedRepositories = repositories.filter(repository =>
    state.selectedIds.has(repository.id)
  );
  const actions = useProjectSourceFormActions({
    onSelection: props.onSelection,
    inventoryLoaded,
    inventoryOwner,
    repositories,
    selectionSupported,
    selectedRepositories,
    state,
  });
  return {
    activeWorkspaceId: state.activeId,
    copyRepositoryLinks: actions.copyRepositoryLinks,
    deleteWorkspace: actions.deleteWorkspace,
    inventoryError,
    openWorkspace: actions.openWorkspace,
    repositories,
    search: state.search,
    selectedIds: state.selectedIds,
    selectedRepositories,
    selectionSupported,
    setSearch: state.setSearch,
    setSelectedIds: actions.setSelectedIds,
    setSource: actions.setSource,
    source: state.source,
  };
}

/*** Reuses server-confirmed selection for the initial source and stages later single-owner inventory. */
function selectRepositories(
  inventory: readonly WorkspaceRepositoryOption[],
  initialOwner: string,
  owner: string,
  selectedIds: ReadonlySet<string>
): readonly WorkspaceRepositoryOption[] {
  if (owner === initialOwner.toLowerCase()) return inventory;
  return inventory.map(repository => ({ ...repository, selected: selectedIds.has(repository.id) }));
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
    <Checkbox
      accessibilityLabel={`${repository.owner}/${repository.name}`}
      aria-checked={props.selectedIds.has(repository.id)}
      key={repository.id}
      checked={props.selectedIds.has(repository.id)}
      size="s"
      onCheckedChange={(checked: boolean) =>
        props.onSelectionChange(setRepositorySelected(props.selectedIds, repository.id, checked))
      }
    >
      {repository.owner}/{repository.name}
    </Checkbox>
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

/*** Remove query-only workspace selection state before displaying the editable source. */
function readSource(currentSource: string | undefined): { readonly owner: string } {
  const value = currentSource?.split('|')[0]?.trim() ?? '';
  try {
    const url = new URL(value);
    if (url.hostname !== 'github.com') return { owner: value };
    return { owner: url.pathname.split('/').find(Boolean) ?? '' };
  } catch {
    return { owner: value.split('/').find(Boolean) ?? value };
  }
}

interface ProjectSourceFormProps {
  readonly activeWorkspaceId?: string;
  readonly currentSource?: string;
  readonly repositories?: readonly WorkspaceRepositoryOption[];
  readonly selectionRequired?: boolean;
  readonly onSelection: (detail: WorkspaceSelectionEventDetail) => void;
}

export interface WorkspaceSelectionEventDetail {
  readonly selectedIds: readonly string[];
  readonly source: string;
}

interface RepositoryPickerProps {
  readonly repositories: readonly WorkspaceRepositoryOption[];
  readonly search: string;
  readonly selectedIds: ReadonlySet<string>;
  readonly selectionSupported: boolean;
  readonly totalCount: number;
  readonly initiallyOpen?: boolean;
  readonly onDeselectAll: () => void;
  readonly onSearchChange: (search: string) => void;
  readonly onSelectAll: () => void;
  readonly onSelectionChange: (ids: Set<string>) => void;
}

const REPOSITORY_PICKER_STYLE = {
  maxHeight: 360,
  minWidth: 280,
  overflowY: 'auto',
  padding: 8,
} as const;
