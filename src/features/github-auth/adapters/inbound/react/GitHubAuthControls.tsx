'use client';
import type { PopoverMenuAction } from '@ankhorage/zora';
import { Avatar } from '@ankhorage/zora/web/avatar';
import { PopoverMenu } from '@ankhorage/zora/web/popover-menu';

import type { GitHubAuthView } from '@/features/github-auth/adapters/inbound/next/readGitHubAuthViewAsync';

/*** Keep account access in one compact avatar menu without exposing credentials to the client. */
export function GitHubAuthControls({ auth, onWorkspaceOpen }: GitHubAuthControlsProps) {
  if (auth.status === 'unavailable') return <span role="status">{auth.message}</span>;
  const isAuthenticated = auth.status === 'authenticated';
  return (
    <>
      <form id="atlas-github-login" action="/api/auth/github/login" method="post" />
      <form id="atlas-github-private-login" action="/api/auth/github/login" method="post">
        <input name="privateRepositoryAccess" type="hidden" value="true" />
      </form>
      <form id="atlas-github-logout" action="/api/auth/github/logout" method="post" />
      <PopoverMenu
        actions={
          isAuthenticated
            ? createAuthenticatedActions(
                auth.privateRepositoryAccess,
                onWorkspaceOpen,
                () => submitAccountForm('atlas-github-private-login'),
                () => submitAccountForm('atlas-github-logout')
              )
            : createAnonymousActions(() => submitAccountForm('atlas-github-login'))
        }
        trigger={({ toggle }) => (
          <button
            aria-label={
              isAuthenticated ? `${auth.displayName} account menu` : 'GitHub account menu'
            }
            className="atlasAccountMenuTrigger"
            type="button"
            onClick={toggle}
          >
            <Avatar
              iconFallback={{ name: 'person-outline' }}
              label={isAuthenticated ? auth.displayName : 'GitHub account'}
              name={isAuthenticated ? auth.displayName : undefined}
              size="s"
              source={isAuthenticated && auth.avatarUrl ? { uri: auth.avatarUrl } : undefined}
            />
          </button>
        )}
      />
    </>
  );
}

interface GitHubAuthControlsProps {
  readonly auth: GitHubAuthView;
  readonly onWorkspaceOpen: () => void;
}

/*** Define account actions separately so the visual trigger remains compact and readable. */
function createAuthenticatedActions(
  privateRepositoryAccess: boolean,
  onWorkspaceOpen: () => void,
  requestPrivateAccess: () => void,
  signOut: () => void
): readonly PopoverMenuAction[] {
  return [
    {
      id: 'workspace',
      title: 'Workspace',
      icon: { name: 'folder-outline' },
      onPress: onWorkspaceOpen,
    },
    {
      id: 'private-repositories',
      title: 'Show private repositories',
      icon: { name: 'lock-closed-outline' },
      selected: privateRepositoryAccess,
      onPress: () => {
        if (!privateRepositoryAccess) requestPrivateAccess();
      },
    },
    {
      id: 'sign-out',
      title: 'Sign out',
      icon: { name: 'log-out-outline' },
      intent: 'danger',
      onPress: signOut,
    },
  ];
}

/*** Limit anonymous account actions to the single possible next step. */
function createAnonymousActions(signIn: () => void): readonly PopoverMenuAction[] {
  return [{ id: 'sign-in', title: 'Sign in', icon: { name: 'log-in-outline' }, onPress: signIn }];
}

/*** Submit a nearby form only in response to a menu action, never while rendering. */
function submitAccountForm(id: string): void {
  const form = document.getElementById(id);
  if (form instanceof HTMLFormElement) form.requestSubmit();
}
