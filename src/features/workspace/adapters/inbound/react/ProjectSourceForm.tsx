'use client';
import { Button } from '@ankhorage/zora/web/button';
import { Dialog } from '@ankhorage/zora/web/dialog';
import { IconButton } from '@ankhorage/zora/web/icon-button';
import { View } from '@ankhorage/zora/web/view';
import { type ReactNode, useMemo, useState } from 'react';

import { useSettings } from '@/features/settings/adapters/inbound/react/useSettings';
import { ProjectSourceControls } from '@/features/workspace/adapters/inbound/react/ProjectSourceControls';
import { useBrowserWorkspaceSession } from '@/features/workspace/adapters/inbound/react/useBrowserWorkspaceSession';
import { useProjectSourceFormActions } from '@/features/workspace/adapters/inbound/react/useProjectSourceFormActions';
import { useProjectSourceFormState } from '@/features/workspace/adapters/inbound/react/useProjectSourceFormState';
import { useRepositoryInventory } from '@/features/workspace/adapters/inbound/react/useRepositoryInventory';
import { WorkspaceDialogTitle } from '@/features/workspace/adapters/inbound/react/WorkspaceDialogTitle';
import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

import styles from './WorkspaceHeader.module.css';

/*** Edits a GitHub source while applying repository selection changes immediately. */
export function ProjectSourceForm(props: ProjectSourceFormProps) {
  const sourceForm = useProjectSourceForm(props);
  const [publicOnly, setPublicOnly] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const visibleRepositories = useVisibleRepositories(
    sourceForm.repositories,
    sourceForm.search,
    publicOnly
  );

  return (
    <>
      <RepositorySourceEntry onOpen={() => setSourceOpen(true)} />
      <ProjectSourceDialog
        authControls={props.authControls}
        initiallyOpen={props.selectionRequired}
        open={sourceOpen}
        publicOnly={publicOnly}
        sourceForm={sourceForm}
        visibleRepositories={visibleRepositories}
        onDismiss={() => setSourceOpen(false)}
        onPublicOnlyChange={setPublicOnly}
      />
    </>
  );
}

/*** Opens the repository workflow from the compact workspace header. */
function RepositorySourceEntry({ onOpen }: RepositorySourceEntryProps) {
  return (
    <IconButton
      icon={{ name: 'settings-outline' }}
      label="Open repository source and workspace"
      size="m"
      variant="ghost"
      onPress={onOpen}
    />
  );
}

/*** Keeps repository choices in a focused ZORA dialog while staging the same selection. */
function ProjectSourceDialog({
  authControls,
  initiallyOpen,
  open,
  publicOnly,
  sourceForm,
  visibleRepositories,
  onDismiss,
  onPublicOnlyChange,
}: ProjectSourceDialogProps) {
  return (
    <Dialog
      closeOnBackdrop
      description="Choose repositories, manage the saved workspace, and start analysis."
      footer={<Button onPress={onDismiss}>Done</Button>}
      title={
        <WorkspaceDialogTitle
          label="Close repository source"
          title="Repository source"
          onDismiss={onDismiss}
        />
      }
      visible={open}
      width="wide"
      onDismiss={onDismiss}
    >
      <View className={styles.mobileSourceDialog} direction="column" gap="s">
        {authControls}
        <ProjectSourceControls
          initiallyOpen={initiallyOpen}
          publicOnly={publicOnly}
          sourceForm={sourceForm}
          visibleRepositories={visibleRepositories}
          onPublicOnlyChange={onPublicOnlyChange}
        />
      </View>
    </Dialog>
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
  const settings = useSettings();
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
    settings,
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
  readonly authControls?: ReactNode;
  readonly currentSource?: string;
  readonly repositories?: readonly WorkspaceRepositoryOption[];
  readonly selectionRequired?: boolean;
  readonly onSelection: (detail: WorkspaceSelectionEventDetail) => void;
}

interface ProjectSourceDialogProps {
  readonly authControls?: ReactNode;
  readonly initiallyOpen?: boolean;
  readonly open: boolean;
  readonly publicOnly: boolean;
  readonly sourceForm: ReturnType<typeof useProjectSourceForm>;
  readonly visibleRepositories: readonly WorkspaceRepositoryOption[];
  readonly onDismiss: () => void;
  readonly onPublicOnlyChange: (checked: boolean) => void;
}

interface RepositorySourceEntryProps {
  readonly onOpen: () => void;
}

export interface WorkspaceSelectionEventDetail {
  readonly selectedIds: readonly string[];
  readonly source: string;
}
