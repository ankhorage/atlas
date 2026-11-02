'use client';
import { Button } from '@zora/button';
import { TextInput } from '@zora/text-input';
import { View } from '@zora/view';
import { useMemo, useState } from 'react';

import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

/*** Edits a GitHub source and stages repository inclusion before one explicit workspace refresh. */
export function ProjectSourceForm(props: ProjectSourceFormProps) {
  const [source, setSource] = useState(readSource(props.currentSource));
  const [selectedIds, setSelectedIds] = useState(createSelectedRepositoryIds(props.repositories));
  const [search, setSearch] = useState('');
  const visibleRepositories = useMemo(
    () =>
      props.repositories?.filter(repository =>
        `${repository.owner}/${repository.name}`
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase())
      ) ?? [],
    [props.repositories, search]
  );
  const openSource = () => {
    const params = new URLSearchParams();
    const normalizedSource = source.trim();
    if (normalizedSource !== '')
      params.set('source', serializeSource(normalizedSource, props.repositories, selectedIds));
    window.location.assign(params.size === 0 ? '/' : `/?${params.toString()}`);
  };

  return (
    <View align="center" direction="row" gap="xs" style={{ flexWrap: 'wrap', maxWidth: 720 }}>
      <TextInput
        accessibilityLabel="GitHub owner or repository"
        placeholder="ankhorage, @ankhorage, or GitHub URL"
        size="s"
        value={source}
        onChangeText={setSource}
        onSubmitEditing={openSource}
      />
      <RepositoryPicker
        repositories={visibleRepositories}
        search={search}
        selectedIds={selectedIds}
        totalCount={props.repositories?.length ?? 0}
        onDeselectAll={() => setSelectedIds(new Set())}
        onSearchChange={setSearch}
        onSelectAll={() =>
          setSelectedIds(new Set(props.repositories?.map(repository => repository.id)))
        }
        onSelectionChange={setSelectedIds}
      />
      <Button size="s" variant="outline" onPress={openSource}>
        Open
      </Button>
    </View>
  );
}

/*** Renders one searchable multi-select rather than a header action for every repository. */
function RepositoryPicker(props: RepositoryPickerProps) {
  return (
    <details>
      <summary aria-label="Choose repositories">
        Repositories ({props.selectedIds.size}/{props.totalCount})
      </summary>
      <div
        style={{
          background: 'var(--zora-surface-default, white)',
          border: '1px solid currentColor',
          maxHeight: 360,
          minWidth: 280,
          overflowY: 'auto',
          padding: 8,
          position: 'absolute',
          zIndex: 2,
        }}
      >
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
    </details>
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

/*** Preserve repository exclusions in the existing source query field. */
function serializeSource(
  source: string,
  repositories: readonly WorkspaceRepositoryOption[] | undefined,
  selectedIds: ReadonlySet<string>
): string {
  const excluded =
    repositories
      ?.filter(repository => !selectedIds.has(repository.id))
      .map(repository => repository.id) ?? [];
  return excluded.length === 0 ? source : `${source}|exclude=${excluded.join(',')}`;
}

/*** Remove query-only workspace selection state before displaying the editable source. */
function readSource(currentSource: string | undefined): string {
  return currentSource?.split('|exclude=')[0] ?? '';
}

interface ProjectSourceFormProps {
  readonly currentSource?: string;
  readonly repositories?: readonly WorkspaceRepositoryOption[];
}

interface RepositoryPickerProps {
  readonly repositories: readonly WorkspaceRepositoryOption[];
  readonly search: string;
  readonly selectedIds: ReadonlySet<string>;
  readonly totalCount: number;
  readonly onDeselectAll: () => void;
  readonly onSearchChange: (search: string) => void;
  readonly onSelectAll: () => void;
  readonly onSelectionChange: (ids: Set<string>) => void;
}
