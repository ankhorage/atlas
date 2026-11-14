'use client';
import { Popover } from '@ankhorage/surface/browser';
import { Button } from '@ankhorage/zora/web/button';
import { TextInput } from '@ankhorage/zora/web/text-input';
import { View } from '@ankhorage/zora/web/view';
import { useEffect, useMemo, useState } from 'react';

import { useRepositoryInventory } from '@/features/workspace/adapters/inbound/react/useRepositoryInventory';
import { WorkspaceControls } from '@/features/workspace/adapters/inbound/react/WorkspaceControls';
import { createBrowserWorkspaceSessionStore } from '@/features/workspace/adapters/outbound/browser/createBrowserWorkspaceSessionStore';
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
      {sourceForm.inventoryError ? <span role="status">{sourceForm.inventoryError}</span> : null}
      <PublicOnlyFilter checked={publicOnly} onChange={setPublicOnly} />
      <RepositoryCopyButton sourceForm={sourceForm} />
      <WorkspaceControls
        activeWorkspaceId={props.activeWorkspaceId}
        repositories={sourceForm.repositories}
        selectedIds={sourceForm.selectedIds}
        source={sourceForm.source}
      />
    </View>
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
  const [source, setSource] = useState(initial.owner);
  const [selectedIds, setSelectedIds] = useState(createSelectedRepositoryIds(props.repositories));
  const [search, setSearch] = useState('');
  const { inventoryError, repositories } = useRepositoryInventory(
    initial.owner,
    props.repositories,
    source
  );
  const selectedRepositories = repositories.filter(repository => selectedIds.has(repository.id));
  const copyRepositoryLinks = () =>
    void navigator.clipboard.writeText(
      selectedRepositories.map(repository => repository.url).join('\n')
    );
  useRestoredWorkspaceSession(setSource, setSelectedIds);
  const updateSelectedIds = (ids: Set<string>) => {
    setSelectedIds(ids);
    createBrowserWorkspaceSessionStore(window.localStorage).save({
      selectedRepositoryIds: [...ids].toSorted(),
      source: source.trim(),
    });
    props.onSelection({ selectedIds: [...ids].toSorted(), source: source.trim() });
  };
  const updateSource = (value: string) => {
    setSource(value);
    createBrowserWorkspaceSessionStore(window.localStorage).save({
      selectedRepositoryIds: [...selectedIds].toSorted(),
      source: value.trim(),
    });
  };
  return {
    copyRepositoryLinks,
    inventoryError,
    repositories,
    search,
    selectedIds,
    selectedRepositories,
    setSearch,
    setSelectedIds: updateSelectedIds,
    setSource: updateSource,
    source,
  };
}

/*** Restores the credential-free active selection after the browser has hydrated. */
function useRestoredWorkspaceSession(
  setSource: (source: string) => void,
  setSelectedIds: (selectedIds: Set<string>) => void
) {
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const session = createBrowserWorkspaceSessionStore(window.localStorage).load();
      if (session === undefined) return;
      setSource(session.source);
      setSelectedIds(new Set(session.selectedRepositoryIds));
    });
    return () => cancelAnimationFrame(frame);
  }, [setSelectedIds, setSource]);
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

/*** Toggle a repository inclusion without requesting another analysis until Open is pressed. */
function toggleRepository(selectedIds: ReadonlySet<string>, repositoryId: string): Set<string> {
  const next = new Set(selectedIds);
  if (next.has(repositoryId)) next.delete(repositoryId);
  else next.add(repositoryId);
  return next;
}

/*** Initialize the browser selection from server-discovered repository state. */
function createSelectedRepositoryIds(
  repositories: readonly WorkspaceRepositoryOption[] | undefined
): Set<string> {
  return new Set(
    repositories?.filter(repository => repository.selected).map(repository => repository.id)
  );
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
  readonly totalCount: number;
  readonly initiallyOpen?: boolean;
  readonly onDeselectAll: () => void;
  readonly onSearchChange: (search: string) => void;
  readonly onSelectAll: () => void;
  readonly onSelectionChange: (ids: Set<string>) => void;
}

const REPOSITORY_PICKER_STYLE = {
  background: 'var(--zora-surface-default, white)',
  border: '1px solid currentColor',
  maxHeight: 360,
  minWidth: 280,
  overflowY: 'auto',
  padding: 8,
} as const;
