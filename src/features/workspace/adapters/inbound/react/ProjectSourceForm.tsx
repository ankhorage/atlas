'use client';
import { Popover } from '@ankhorage/surface/browser';
import { Button } from '@ankhorage/zora/web/button';
import { TextInput } from '@ankhorage/zora/web/text-input';
import { View } from '@ankhorage/zora/web/view';
import { useEffect, useMemo, useState } from 'react';

import { WorkspaceControls } from '@/features/workspace/adapters/inbound/react/WorkspaceControls';
import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

/*** Edits a GitHub source and stages repository inclusion before one explicit workspace refresh. */
export function ProjectSourceForm(props: ProjectSourceFormProps) {
  const sourceForm = useProjectSourceForm(props);
  const visibleRepositories = useVisibleRepositories(props.repositories, sourceForm.search);

  return (
    <View
      align="center"
      direction="row"
      gap="xs"
      style={{ flexWrap: 'wrap', maxWidth: 720, position: 'relative', zIndex: 1 }}
    >
      <TextInput
        accessibilityLabel="GitHub owner"
        placeholder="ankhorage or @me"
        size="s"
        value={sourceForm.source}
        onChangeText={sourceForm.setSource}
        onSubmitEditing={sourceForm.openSource}
      />
      <RepositoryPicker
        repositories={visibleRepositories}
        search={sourceForm.search}
        selectedIds={sourceForm.selectedIds}
        totalCount={props.repositories?.length ?? 0}
        initiallyOpen={props.selectionRequired}
        onDeselectAll={() => sourceForm.setSelectedIds(new Set())}
        onSearchChange={sourceForm.setSearch}
        onSelectAll={() =>
          sourceForm.setSelectedIds(new Set(props.repositories?.map(repository => repository.id)))
        }
        onSelectionChange={sourceForm.setSelectedIds}
      />
      <RepositoryCopyButton sourceForm={sourceForm} />
      <Button size="s" variant="outline" onPress={sourceForm.openSource}>
        Open
      </Button>
      <WorkspaceControls
        activeWorkspaceId={props.activeWorkspaceId}
        repositories={props.repositories}
        selectedIds={sourceForm.selectedIds}
        source={sourceForm.source}
      />
    </View>
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
  search: string
): readonly WorkspaceRepositoryOption[] {
  return useMemo(
    () =>
      repositories?.filter(repository =>
        `${repository.owner}/${repository.name}`
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase())
      ) ?? [],
    [repositories, search]
  );
}

/*** Keeps staged source edits isolated until an explicit workspace refresh is requested. */
function useProjectSourceForm(props: ProjectSourceFormProps) {
  const initial = readSource(props.currentSource);
  const [source, setSource] = useState(initial.owner);
  const [selectedIds, setSelectedIds] = useState(createSelectedRepositoryIds(props.repositories));
  const [search, setSearch] = useState('');
  const selectedRepositories =
    props.repositories?.filter(repository => selectedIds.has(repository.id)) ?? [];
  const openSource = () => {
    const params = new URLSearchParams();
    const normalizedSource = source.trim();
    if (normalizedSource !== '') params.set('source', normalizedSource);
    if (props.repositories !== undefined)
      params.set('repositories', [...selectedIds].toSorted().join(','));
    window.location.assign(params.size === 0 ? '/' : `/?${params.toString()}`);
  };
  const copyRepositoryLinks = () =>
    void navigator.clipboard.writeText(
      selectedRepositories.map(repository => repository.url).join('\n')
    );
  useEffect(() => {
    if (source.trim() === '' || source.trim() === initial.owner) return;
    const timer = window.setTimeout(() => {
      window.location.assign(`/?${new URLSearchParams({ source: source.trim() }).toString()}`);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [initial.owner, source]);
  return {
    copyRepositoryLinks,
    openSource,
    search,
    selectedIds,
    selectedRepositories,
    setSearch,
    setSelectedIds,
    setSource,
    source,
  };
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
