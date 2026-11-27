import { parseAppManifest } from '@ankhorage/contracts';
import { assert, describe, it, render } from '@artiphishle/testosterone';
import React, { useState } from 'react';

import { ZoraRuntimeProvider } from '@/features/theme/adapters/inbound/react/ZoraRuntimeProvider';
import { RepositoryBranchControl } from '@/features/workspace/adapters/inbound/react/RepositoryBranchControl';
import type { RepositoryBranchOptions } from '@/features/workspace/adapters/inbound/react/useProjectSourceFormState';
import appManifest from '../../../../ankh.config.json';

describe('[RepositoryBranchControl]', () => {
  it('caches alphabetized branches and displays the controlled ZORA Select value', async () => {
    const parsed = parseAppManifest(appManifest);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const originalFetch = globalThis.fetch;
    let loaded: RepositoryBranchOptions | undefined;
    globalThis.fetch = Object.assign(
      async () =>
        Response.json({
          branches: ['zeta', 'alpha', 'main'],
          repository: { defaultBranch: 'main' },
        }),
      { preconnect: originalFetch.preconnect }
    );
    try {
      const { container, unmount } = render(
        <ZoraRuntimeProvider
          initialMode={parsed.manifest.activeThemeMode ?? 'light'}
          themeConfig={parsed.manifest.themes[parsed.manifest.activeThemeId]}
        >
          <BranchControlHarness
            onLoad={options => {
              loaded = options;
            }}
          />
        </ZoraRuntimeProvider>
      );
      const load = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
        button => button.textContent === 'Branch'
      );
      await React.act(async () => load?.click());

      const trigger = document.querySelector<HTMLButtonElement>(
        '[data-testid="repository-branch-atlas-trigger"]'
      );
      assert.equal(trigger?.textContent?.includes('main'), true);
      assert.deepEqual(loaded?.branches, ['alpha', 'main', 'zeta']);
      unmount();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

/*** Retains loaded choices across picker-row remounts exactly as the source form does. */
function BranchControlHarness({ onLoad }: BranchControlHarnessProps) {
  const [options, setOptions] = useState<RepositoryBranchOptions | undefined>();
  return (
    <RepositoryBranchControl
      branch={undefined}
      options={options}
      repository={{
        id: 'atlas',
        name: 'atlas',
        owner: 'ankhorage',
        selected: true,
        url: 'https://github.com/ankhorage/atlas',
        visibility: 'public',
      }}
      source="ankhorage"
      onChange={() => {}}
      onLoad={(_, value) => {
        onLoad(value);
        setOptions(value);
      }}
    />
  );
}

interface BranchControlHarnessProps {
  readonly onLoad: (options: RepositoryBranchOptions) => void;
}
