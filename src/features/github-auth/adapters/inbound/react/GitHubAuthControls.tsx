'use client';
import { Button } from '@ankhorage/zora/web/button';
import { useRef, useState } from 'react';

import type { GitHubAuthView } from '@/features/github-auth/adapters/inbound/next/readGitHubAuthViewAsync';

/*** Render GitHub account actions in the existing ZORA header without exposing credentials to the client. */
export function GitHubAuthControls({ auth }: { readonly auth: GitHubAuthView }) {
  const loginForm = useRef<HTMLFormElement>(null);
  const logoutForm = useRef<HTMLFormElement>(null);
  const [privateRepositoryAccess, setPrivateRepositoryAccess] = useState(false);

  if (auth.status === 'authenticated')
    return (
      <form ref={logoutForm} action="/api/auth/github/logout" method="post">
        <Button size="s" variant="outline" onPress={() => logoutForm.current?.requestSubmit()}>
          Sign out {auth.displayName}
        </Button>
      </form>
    );
  if (auth.status === 'unavailable') return <span role="status">{auth.message}</span>;
  return (
    <form ref={loginForm} action="/api/auth/github/login" method="post">
      <label>
        <input
          checked={privateRepositoryAccess}
          name="privateRepositoryAccess"
          type="checkbox"
          value="true"
          onChange={event => setPrivateRepositoryAccess(event.target.checked)}
        />{' '}
        Include private repositories (GitHub `repo` scope also permits write access)
      </label>
      <Button size="s" variant="outline" onPress={() => loginForm.current?.requestSubmit()}>
        Sign in with GitHub
      </Button>
    </form>
  );
}
