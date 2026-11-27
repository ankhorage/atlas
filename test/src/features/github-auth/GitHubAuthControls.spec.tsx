import { parseAppManifest } from '@ankhorage/contracts';
import { assert, describe, it, render } from '@artiphishle/testosterone';
import React from 'react';

import { GitHubAuthControls } from '@/features/github-auth/adapters/inbound/react/GitHubAuthControls';
import { ZoraRuntimeProvider } from '@/features/theme/adapters/inbound/react/ZoraRuntimeProvider';
import appManifest from '../../../../ankh.config.json';

describe('[GitHubAuthControls]', () => {
  it('starts private-repository authorization again when the current session is marked private', async () => {
    const parsed = parseAppManifest(appManifest);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const { container, unmount } = render(
      <ZoraRuntimeProvider
        initialMode={parsed.manifest.activeThemeMode ?? 'light'}
        themeConfig={parsed.manifest.themes[parsed.manifest.activeThemeId]}
      >
        <GitHubAuthControls
          auth={{
            displayName: 'GitHub account',
            privateRepositoryAccess: true,
            status: 'authenticated',
          }}
          onWorkspaceOpen={() => {}}
        />
      </ZoraRuntimeProvider>
    );
    const form = container.querySelector<HTMLFormElement>('#atlas-github-private-login');
    let privateAuthorizationRequests = 0;
    form?.addEventListener('submit', event => {
      event.preventDefault();
      privateAuthorizationRequests += 1;
    });

    await React.act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="GitHub account account menu"]')
        ?.click()
    );
    await React.act(async () => {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    });
    const privateRepositories = [
      ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find(item => item.textContent?.includes('Show private repositories'));
    assert.notEqual(privateRepositories, undefined);
    await React.act(async () => privateRepositories?.click());

    assert.equal(privateAuthorizationRequests, 1);
    unmount();
  });
});
