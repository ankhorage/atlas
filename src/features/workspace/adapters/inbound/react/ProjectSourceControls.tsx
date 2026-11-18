'use client';
import { Popover } from '@ankhorage/surface/browser';
import { Button } from '@ankhorage/zora/web/button';
import { TextInput } from '@ankhorage/zora/web/text-input';
import { View } from '@ankhorage/zora/web/view';

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
    <label className={styles.publicOnly}>
      <input checked={checked} type="checkbox" onChange={event => onChange(event.target.checked)} />
      Public only
    </label>
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
      <div style={REPOSITORY_PICKER_STYLE}>
        <input
          aria-label="Search repositories"
          placeholder="Search repositories"
          value={props.search}
          onChange={event => props.onSearchChange(event.target.value)}
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
      </div>
    </Popover>
  );
}

/*** Renders the searchable repository checkbox choices. */
function RepositoryChoices(props: RepositoryPickerProps) {
  if (props.repositories.length === 0) return <span>No repositories match this search.</span>;
  return props.repositories.map(repository => (
    <label key={repository.id} style={{ display: 'block', paddingBlock: 3 }}>
      <input
        checked={props.selectedIds.has(repository.id)}
        type="checkbox"
        onChange={() => props.onSelectionChange(toggleRepository(props.selectedIds, repository.id))}
      />{' '}
      {repository.owner}/{repository.name}
    </label>
  ));
}

/*** Toggle a repository inclusion and pass the immediate selection to its workspace owner. */
function toggleRepository(selectedIds: ReadonlySet<string>, repositoryId: string): Set<string> {
  const next = new Set(selectedIds);
  if (next.has(repositoryId)) next.delete(repositoryId);
  else next.add(repositoryId);
  return next;
}

const REPOSITORY_PICKER_STYLE = {
  background: 'var(--zora-surface-default, white)',
  border: '1px solid currentColor',
  maxHeight: 360,
  minWidth: 280,
  overflowY: 'auto',
  padding: 8,
} as const;
