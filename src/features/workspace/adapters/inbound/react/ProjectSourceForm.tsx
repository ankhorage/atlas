'use client';
import { Button } from '@zora/button';
import { TextInput } from '@zora/text-input';
import { View } from '@zora/view';
import { useState } from 'react';

import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

/*** Navigates to a GitHub owner or repository and persists selected repository exclusions. */
export function ProjectSourceForm(props: ProjectSourceFormProps) {
  const [source, setSource] = useState(readSource(props.currentSource));
  const [selectedIds, setSelectedIds] = useState(createSelectedRepositoryIds(props.repositories));
  const openSource = (nextSelectedIds = selectedIds) => {
    const params = new URLSearchParams();
    const normalizedSource = source.trim();
    if (normalizedSource !== '')
      params.set('source', serializeSource(normalizedSource, props.repositories, nextSelectedIds));
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
      <Button size="s" variant="outline" onPress={openSource}>
        Open
      </Button>
      {props.repositories?.map(repository => (
        <RepositoryToggle
          key={repository.id}
          repository={repository}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          onOpenSource={openSource}
        />
      ))}
    </View>
  );
}

/*** Toggle one repository while retaining selections from all discovered GitHub sources. */
function RepositoryToggle(props: RepositoryToggleProps) {
  const toggle = () => {
    const next = new Set(props.selectedIds);
    if (next.has(props.repository.id)) next.delete(props.repository.id);
    else next.add(props.repository.id);
    props.setSelectedIds(next);
    props.onOpenSource(next);
  };
  return (
    <Button
      size="s"
      variant={props.selectedIds.has(props.repository.id) ? 'outline' : 'ghost'}
      onPress={toggle}
    >
      {props.repository.owner}/{props.repository.name}
    </Button>
  );
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
interface RepositoryToggleProps {
  readonly repository: WorkspaceRepositoryOption;
  readonly selectedIds: ReadonlySet<string>;
  readonly setSelectedIds: (ids: Set<string>) => void;
  readonly onOpenSource: (ids: Set<string>) => void;
}
