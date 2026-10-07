import { parseAppManifest } from '@ankhorage/contracts';
import { assert, describe, it, render } from '@artiphishle/testosterone';
import React from 'react';

import { ZoraRuntimeProvider } from '@/features/theme/adapters/inbound/react/ZoraRuntimeProvider';
import { WorkspaceView } from '@/features/workspace/adapters/inbound/react/WorkspaceView';
import appManifest from '../../../../ankh.config.json';

describe('[WorkspaceView]', () => {
  it('renders the project title, Home breadcrumb, and persistent error inside the ZORA app shell', () => {
    const parsed = parseAppManifest(appManifest);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const { container, unmount } = render(
      <ZoraRuntimeProvider
        initialMode={parsed.manifest.activeThemeMode ?? 'light'}
        themeConfig={parsed.manifest.themes[parsed.manifest.activeThemeId]}
      >
        <WorkspaceView
          projectName="Atlas"
          workspace={{ ok: false, error: 'Dependency analysis failed.' }}
        />
      </ZoraRuntimeProvider>
    );

    assert.equal(container.textContent?.includes('Atlas'), true);
    assert.equal(container.textContent?.includes('Home'), true);
    assert.equal(container.textContent?.includes('Packages'), false);
    assert.equal(
      container
        .querySelector('[role="alert"]')
        ?.textContent?.includes('Dependency analysis failed.'),
      true
    );
    unmount();
  });
});
