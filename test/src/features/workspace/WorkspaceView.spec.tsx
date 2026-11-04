import { parseAppManifest } from '@ankhorage/contracts';
import { assert, describe, it, render } from '@artiphishle/testosterone';
import React from 'react';

import { ZoraRuntimeProvider } from '@/features/theme/adapters/inbound/react/ZoraRuntimeProvider';
import { WorkspaceView } from '@/features/workspace/adapters/inbound/react/WorkspaceView';
import appManifest from '../../../../ankh.config.json';

describe('[WorkspaceView]', () => {
  it('hydrates a saved workspace selector only in the browser and preserves its stable settings scope', async () => {
    window.localStorage.setItem(
      'atlas.workspace-definitions.v1',
      JSON.stringify([
        {
          version: 1,
          id: 'ankhorage-ecosystem',
          name: 'Ankhorage Ecosystem',
          sources: [{ kind: 'github-owner', owner: 'ankhorage', excludedRepositoryIds: [] }],
          settings: {
            dependencyPrefix: '@ankhorage/',
            dependencyKinds: ['runtime'],
            layout: 'concentric',
            showCompoundNodes: true,
            showVendorPackages: false,
            spacing: 1,
            subPackageDepth: 1,
          },
        },
      ])
    );
    const parsed = parseAppManifest(appManifest);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const { container, unmount } = render(
      <ZoraRuntimeProvider
        initialMode={parsed.manifest.activeThemeMode ?? 'light'}
        themeConfig={parsed.manifest.themes[parsed.manifest.activeThemeId]}
      >
        <WorkspaceView
          currentSource="ankhorage"
          projectName="GitHub workspace"
          workspace={{ ok: false, error: 'Loading.' }}
          workspaceScope="ankhorage-ecosystem"
        />
      </ZoraRuntimeProvider>
    );
    await React.act(async () => {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    });

    assert.equal(
      container.querySelector('[aria-label="Manage workspaces"]')?.textContent,
      'Workspace'
    );
    assert.equal(
      container.querySelector<HTMLSelectElement>('[aria-label="Saved workspace"]')?.value,
      'ankhorage-ecosystem'
    );
    unmount();
    window.localStorage.removeItem('atlas.workspace-definitions.v1');
  });

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
