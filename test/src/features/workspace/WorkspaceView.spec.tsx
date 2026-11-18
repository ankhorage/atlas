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

    const sourceEntry = container.querySelector<HTMLButtonElement>(
      '[aria-label="Open repository source and workspace"]'
    );
    await React.act(async () => sourceEntry?.click());
    await React.act(async () => {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    });
    const workspaceMenu = document.querySelector<HTMLButtonElement>(
      '[aria-label="Manage workspaces"]'
    );
    assert.equal(workspaceMenu?.textContent, 'Workspace');
    await React.act(async () => workspaceMenu?.click());
    assert.equal(
      document.querySelector<HTMLSelectElement>('[aria-label="Saved workspace"]')?.value,
      'ankhorage-ecosystem'
    );
    unmount();
    window.localStorage.removeItem('atlas.workspace-definitions.v1');
  });

  it('renders the Atlas brand, icon-only Home action, and persistent error inside the ZORA app shell', () => {
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
    assert.equal(container.textContent?.includes('Home'), false);
    assert.equal(container.querySelector('[aria-label="Home"]') !== null, true);
    assert.equal(container.textContent?.includes('Packages'), false);
    assert.equal(
      container
        .querySelector('[role="alert"]')
        ?.textContent?.includes('Dependency analysis failed.'),
      true
    );
    unmount();
  });

  it('keeps the Public only repository filter unchecked until the user enables it', async () => {
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
          projectName="Atlas"
          repositories={[
            {
              id: 'atlas',
              name: 'atlas',
              owner: 'ankhorage',
              selected: true,
              url: 'https://github.com/ankhorage/atlas',
              visibility: 'public',
            },
          ]}
          workspace={{ ok: false, error: 'Dependency analysis failed.' }}
        />
      </ZoraRuntimeProvider>
    );

    await React.act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Open repository source and workspace"]')
        ?.click()
    );
    const publicOnly = document.querySelector<HTMLElement>(
      '[role="checkbox"][aria-label="Public only"]'
    );
    assert.equal(publicOnly?.textContent?.trim(), 'Public only');
    assert.equal(publicOnly?.querySelector<HTMLInputElement>('input')?.checked, false);
    unmount();
  });

  it('keeps repository and workspace actions in one accessible mobile source workflow', async () => {
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
          projectName="Atlas"
          repositories={[
            {
              id: 'atlas',
              name: 'atlas',
              owner: 'ankhorage',
              selected: true,
              url: 'https://github.com/ankhorage/atlas',
              visibility: 'public',
            },
          ]}
          workspace={{ ok: false, error: 'Dependency analysis failed.' }}
        />
      </ZoraRuntimeProvider>
    );
    const sourceEntry = container.querySelector<HTMLButtonElement>(
      '[aria-label="Open repository source and workspace"]'
    );

    assert.equal(sourceEntry !== null, true);
    await React.act(async () => sourceEntry?.click());
    assert.equal(document.body.textContent?.includes('Repository source'), true);
    assert.equal(document.body.querySelector('[aria-label="Manage workspaces"]') !== null, true);
    assert.equal(
      document.body.querySelector('[aria-label="Close repository source"]') !== null,
      true
    );
    assert.equal(
      [...document.body.querySelectorAll('button')].some(button =>
        button.textContent?.includes('Done')
      ),
      true
    );
    unmount();
  });

  it('reports selected, pending, successful, failed, and cancelled repositories without calling pending work failed', () => {
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
          repositoryStatuses={[
            status('loading'),
            status('successful'),
            status('failed'),
            status('cancelled'),
          ]}
          workspace={{ ok: false, error: 'Loading.' }}
        />
      </ZoraRuntimeProvider>
    );
    assert.equal(
      container.textContent?.includes(
        '3 of 4 analyzed · 1 pending · 1 successful · 1 failed · 1 cancelled'
      ),
      true
    );
    assert.equal(
      container.textContent?.includes('Sign in with GitHub to analyze many repositories'),
      true
    );
    const statusRegion = container.querySelector<HTMLElement>(
      '[aria-label="Repository loading status"]'
    );
    assert.equal(statusRegion?.style.position, 'absolute');
    assert.equal(statusRegion?.parentElement?.style.flex, '1 1 0%');
    assert.equal(container.textContent?.includes('3 of 4 repositories failed'), false);
    unmount();
  });
});

/** Build client-safe repository states covering every terminal and pending outcome. */
function status(status: 'cancelled' | 'failed' | 'loading' | 'successful') {
  return {
    repository: { id: status, name: status, owner: 'ankhorage' },
    status,
  };
}
