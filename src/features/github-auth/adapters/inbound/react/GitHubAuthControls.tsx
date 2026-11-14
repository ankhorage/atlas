'use client';
import { Button } from '@ankhorage/zora/web/button';
import { View } from '@ankhorage/zora/web/view';
import { useRef } from 'react';

import type { GitHubAuthView } from '@/features/github-auth/adapters/inbound/next/readGitHubAuthViewAsync';

/*** Render GitHub account actions in the existing ZORA header without exposing credentials to the client. */
export function GitHubAuthControls({ auth }: { readonly auth: GitHubAuthView }) {
  const loginForm = useRef<HTMLFormElement>(null);
  const privateLoginForm = useRef<HTMLFormElement>(null);
  const logoutForm = useRef<HTMLFormElement>(null);

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
    <View direction="row" gap="xs" style={{ flexWrap: 'wrap' }}>
      <form ref={loginForm} action="/api/auth/github/login" method="post">
        <Button size="s" variant="outline" onPress={() => loginForm.current?.requestSubmit()}>
          Sign in with GitHub
        </Button>
      </form>
      <form ref={privateLoginForm} action="/api/auth/github/login" method="post">
        <input name="privateRepositoryAccess" type="hidden" value="true" />
        <Button
          size="s"
          variant="outline"
          onPress={() => privateLoginForm.current?.requestSubmit()}
        >
          Authorize private repositories
        </Button>
      </form>
    </View>
  );
}
