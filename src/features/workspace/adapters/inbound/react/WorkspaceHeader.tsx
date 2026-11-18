'use client';
import { AppHeader } from '@ankhorage/zora/web/app-header';
import { Breadcrumbs } from '@ankhorage/zora/web/breadcrumbs';
import { Heading } from '@ankhorage/zora/web/heading';
import { IconButton } from '@ankhorage/zora/web/icon-button';
import { Image } from '@ankhorage/zora/web/image';
import { useZoraTheme } from '@ankhorage/zora/web/runtime';

import type { GitHubAuthView } from '@/features/github-auth/adapters/inbound/next/readGitHubAuthViewAsync';
import { GitHubAuthControls } from '@/features/github-auth/adapters/inbound/react/GitHubAuthControls';
import type { WorkspaceSelectionEventDetail } from '@/features/workspace/adapters/inbound/react/ProjectSourceForm';
import { ProjectSourceForm } from '@/features/workspace/adapters/inbound/react/ProjectSourceForm';
import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';
import type { ProjectTreeNode } from '@/types/projectTree';

import styles from './WorkspaceHeader.module.css';

/*** Renders workspace breadcrumbs, source selection, and theme action. */
export function WorkspaceHeader(props: WorkspaceHeaderProps) {
  const { theme } = useZoraTheme();

  return (
    <AppHeader inverted safeAreaTop={false} testID="workspace-header">
      <div className={styles.content}>
        <WorkspaceIdentity {...props} />
        <div
          className={styles.actions}
          data-testid="workspace-header-actions"
          style={{ color: theme.semantics.content.default }}
        >
          <WorkspaceHeaderActions {...props} />
        </div>
      </div>
    </AppHeader>
  );
}

/*** Renders the fixed Atlas brand and navigable package context in the compact header. */
function WorkspaceIdentity(props: WorkspaceHeaderProps) {
  return (
    <div className={styles.identity}>
      <Image alt="Atlas" height={24} source="/favicon.ico" width={24} />
      <Heading level={3} numberOfLines={1} size="h5">
        Atlas
      </Heading>
      <IconButton
        icon={{ name: 'home-outline' }}
        label="Home"
        size="m"
        variant="ghost"
        onPress={() => props.onNavigate('')}
      />
      <div className={styles.breadcrumbs}>
        <Breadcrumbs
          compact
          items={createBreadcrumbItems(props.currentPackage, props.projectTree)}
          maxItems={3}
          separator="›"
          onItemPress={({ id }: { readonly id: string }) => props.onNavigate(id)}
        />
      </div>
    </div>
  );
}

/*** Renders repository access and theme controls without expanding the workspace header row. */
function WorkspaceHeaderActions(props: WorkspaceHeaderProps) {
  const { mode, setMode } = useZoraTheme();
  return (
    <>
      {props.offline ? (
        <span aria-label="Offline snapshot">Offline snapshot</span>
      ) : (
        <ProjectSourceForm
          activeWorkspaceId={props.workspaceScope}
          currentSource={props.currentSource}
          repositories={props.repositories}
          selectionRequired={props.selectionRequired}
          authControls={<GitHubAuthControls auth={props.githubAuth} />}
          onSelection={props.onSelection}
        />
      )}
      <IconButton
        icon={{ name: mode === 'dark' ? 'sunny-outline' : 'moon-outline' }}
        label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
        size="m"
        variant="ghost"
        onPress={() => setMode(mode === 'dark' ? 'light' : 'dark')}
      />
    </>
  );
}

/*** Creates package breadcrumbs from a stable Home root to the active package path. */
function createBreadcrumbItems(
  currentPackage: string,
  projectTree: readonly ProjectTreeNode[]
): readonly BreadcrumbItem[] {
  const repositoryCrumbs = findRepositoryBreadcrumbs(currentPackage, projectTree);
  if (repositoryCrumbs !== null) return repositoryCrumbs;
  const packageSegments = normalizeGraphPackage(currentPackage).split('.').filter(Boolean);
  const packageItems = packageSegments.map((label, index) => ({
    id: packageSegments.slice(0, index + 1).join('.'),
    label,
  }));

  return packageItems;
}

/*** Present virtual owner and repository labels without leaking technical graph identities. */
function findRepositoryBreadcrumbs(
  currentPackage: string,
  projectTree: readonly ProjectTreeNode[]
): readonly BreadcrumbItem[] | null {
  const match = projectTree
    .flatMap(owner => (owner.children ?? []).map(repository => ({ owner, repository })))
    .find(
      ({ repository }) =>
        repository.kind === 'virtual' &&
        repository.graphPackage !== '' &&
        (currentPackage === repository.graphPackage ||
          currentPackage.startsWith(`${repository.graphPackage}.`))
    );
  if (match === undefined) return null;

  const remainder = currentPackage
    .slice(match.repository.graphPackage.length)
    .replace(/^\./, '')
    .split('.')
    .filter(segment => segment && segment !== 'module' && segment !== 'package');
  return [
    { id: '', label: match.owner.label },
    { id: match.repository.graphPackage, label: match.repository.label },
    ...remainder.map((label, index) => ({
      id: `${match.repository.graphPackage}.${remainder.slice(0, index + 1).join('.')}`,
      label,
    })),
  ];
}

/*** Normalizes navigation paths to the package identity representation used by the graph view. */
function normalizeGraphPackage(path: string): string {
  return path.replaceAll('/', '.').replace(/^\.+|\.+$/g, '');
}

interface WorkspaceHeaderProps {
  readonly currentPackage: string;
  readonly currentSource?: string;
  readonly githubAuth: GitHubAuthView;
  readonly offline?: boolean;
  readonly projectTree: readonly ProjectTreeNode[];
  readonly repositories?: readonly WorkspaceRepositoryOption[];
  readonly selectionRequired?: boolean;
  readonly workspaceScope?: string;
  readonly onNavigate: (path: string) => void;
  readonly onSelection: (detail: WorkspaceSelectionEventDetail) => void;
}

interface BreadcrumbItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: { readonly name: string };
}
