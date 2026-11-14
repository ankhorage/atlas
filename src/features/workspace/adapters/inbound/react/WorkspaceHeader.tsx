'use client';
import { AppHeader } from '@ankhorage/zora/web/app-header';
import { Breadcrumbs } from '@ankhorage/zora/web/breadcrumbs';
import { Button } from '@ankhorage/zora/web/button';
import { useZoraTheme } from '@ankhorage/zora/web/runtime';
import { View } from '@ankhorage/zora/web/view';

import type { GitHubAuthView } from '@/features/github-auth/adapters/inbound/next/readGitHubAuthViewAsync';
import { GitHubAuthControls } from '@/features/github-auth/adapters/inbound/react/GitHubAuthControls';
import { ProjectSourceForm } from '@/features/workspace/adapters/inbound/react/ProjectSourceForm';
import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';
import type { ProjectTreeNode } from '@/types/projectTree';

/*** Renders workspace breadcrumbs, source selection, and theme action. */
export function WorkspaceHeader(props: WorkspaceHeaderProps) {
  const { mode, setMode } = useZoraTheme();

  return (
    <AppHeader
      inverted
      actions={
        <View align="center" direction="row" gap="s">
          {props.offline ? (
            <span aria-label="Offline snapshot">Offline snapshot</span>
          ) : (
            <ProjectSourceForm
              activeWorkspaceId={props.workspaceScope}
              currentSource={props.currentSource}
              repositories={props.repositories}
              selectionRequired={props.selectionRequired}
            />
          )}
          {props.offline ? null : <GitHubAuthControls auth={props.githubAuth} />}
          <Button
            leadingIcon={{ name: mode === 'dark' ? 'sunny-outline' : 'moon-outline' }}
            size="s"
            variant="outline"
            onPress={() => setMode(mode === 'dark' ? 'light' : 'dark')}
          >
            {mode === 'dark' ? 'Light' : 'Dark'}
          </Button>
        </View>
      }
      safeAreaTop={false}
      subtitle={
        <Breadcrumbs
          compact
          items={createBreadcrumbItems(props.currentPackage, props.projectTree)}
          separator="›"
          onItemPress={({ id }: { readonly id: string }) => props.onNavigate(id)}
        />
      }
      title={props.projectName}
    />
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

  return [{ id: '', label: 'Home', icon: { name: 'home-outline' } }, ...packageItems];
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
    { id: '', label: 'Home', icon: { name: 'home-outline' } },
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
  readonly projectName: string;
  readonly projectTree: readonly ProjectTreeNode[];
  readonly repositories?: readonly WorkspaceRepositoryOption[];
  readonly selectionRequired?: boolean;
  readonly workspaceScope?: string;
  readonly onNavigate: (path: string) => void;
}

interface BreadcrumbItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: { readonly name: string };
}
