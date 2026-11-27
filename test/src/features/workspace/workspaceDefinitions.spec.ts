import { assert, describe, it } from '@artiphishle/testosterone';

import { createBrowserWorkspaceStore } from '@/features/workspace/adapters/outbound/browser/createBrowserWorkspaceStore';
import { reconcileWorkspaceDefinitions } from '@/features/workspace/application/use-cases/reconcileWorkspaceDefinitions';
import { validateWorkspaceDefinitions } from '@/features/workspace/application/use-cases/validateWorkspaceDefinitions';
import type { WorkspaceDefinition } from '@/types/workspace';

const WORKSPACE: WorkspaceDefinition = {
  version: 1,
  id: 'ankhorage-ecosystem',
  name: 'Ankhorage Ecosystem',
  sources: [
    {
      kind: 'github-owner',
      owner: 'ankhorage',
      excludedRepositoryIds: ['R_ch-deinjob', 'R_sharkprey'],
    },
    {
      kind: 'github-repository',
      repositoryId: 'R_atlas',
      url: 'https://github.com/ankhorage/atlas',
    },
  ],
  settings: {
    dependencyPrefix: '@ankhorage/',
    dependencyKinds: ['runtime', 'dev', 'peer', 'optional'],
    layout: 'breadthfirst',
    showCompoundNodes: true,
    showVendorPackages: false,
    spacing: 80,
    subPackageDepth: 2,
    repositoryColors: {},
  },
};

describe('[workspace definitions]', () => {
  it('accepts v1 workspaces without repository color overrides', () => {
    const { repositoryColors: _, ...settings } = WORKSPACE.settings;
    const legacy = { ...WORKSPACE, settings };

    assert.deepEqual(validateWorkspaceDefinitions([legacy])?.[0]?.settings.repositoryColors, {});
  });

  it('persists slash-containing branch selections and rejects unsafe branch values', () => {
    const branchSelections = { R_atlas: 'feature/draft' };
    assert.deepEqual(
      validateWorkspaceDefinitions([{ ...WORKSPACE, branchSelections }])?.[0]?.branchSelections,
      branchSelections
    );
    assert.equal(
      validateWorkspaceDefinitions([{ ...WORKSPACE, branchSelections: { R_atlas: 'main\n' } }]),
      null
    );
  });

  it('accepts only bounded canonical repository color overrides', () => {
    const repositoryColors = { R_atlas: '#AABBCC' };
    const oversizedRepositoryColors = Object.fromEntries(
      Array.from({ length: 101 }, (_, index) => [`R_${index}`, '#AABBCC'])
    );

    assert.deepEqual(
      validateWorkspaceDefinitions([
        { ...WORKSPACE, settings: { ...WORKSPACE.settings, repositoryColors } },
      ])?.[0]?.settings.repositoryColors,
      repositoryColors
    );
    assert.equal(
      validateWorkspaceDefinitions([
        {
          ...WORKSPACE,
          settings: { ...WORKSPACE.settings, repositoryColors: { 'R/atlas': '#AABBCC' } },
        },
      ]),
      null
    );
    assert.equal(
      validateWorkspaceDefinitions([
        {
          ...WORKSPACE,
          settings: { ...WORKSPACE.settings, repositoryColors: { R_atlas: '#aabbcc' } },
        },
      ]),
      null
    );
    assert.equal(
      validateWorkspaceDefinitions([
        {
          ...WORKSPACE,
          settings: { ...WORKSPACE.settings, repositoryColors: oversizedRepositoryColors },
        },
      ]),
      null
    );
  });

  it('creates, saves, reopens, renames, and deletes independent named workspaces', () => {
    const storage = new MemoryStorage();
    const store = createBrowserWorkspaceStore(storage);
    const saved = store.apply({ kind: 'save', workspace: WORKSPACE });
    const renamed = store.apply({ kind: 'rename', id: WORKSPACE.id, name: 'Atlas Ecosystem' });
    const reopened = store.load();
    const deleted = store.apply({ kind: 'delete', id: WORKSPACE.id });

    assert.deepEqual(saved, [WORKSPACE]);
    assert.equal(reopened[0]?.name, 'Atlas Ecosystem');
    assert.equal(renamed[0]?.name, 'Atlas Ecosystem');
    assert.deepEqual(deleted, []);
  });

  it('preserves owner-wide exclusions and explicit repository-only selection separately', () => {
    const reconciled = reconcileWorkspaceDefinitions([], { kind: 'save', workspace: WORKSPACE });

    assert.deepEqual(reconciled[0]?.sources, WORKSPACE.sources);
  });

  it('rejects malformed, duplicate, local, and credential-bearing persisted definitions', () => {
    assert.equal(validateWorkspaceDefinitions([{ ...WORKSPACE, version: 2 }]), null);
    assert.equal(validateWorkspaceDefinitions([WORKSPACE, WORKSPACE]), null);
    assert.equal(
      validateWorkspaceDefinitions([
        {
          ...WORKSPACE,
          sources: [
            { kind: 'github-repository', repositoryId: 'R_atlas', url: 'file:///tmp/atlas' },
          ],
        },
      ]),
      null
    );
    assert.equal(
      validateWorkspaceDefinitions([
        {
          ...WORKSPACE,
          sources: [
            {
              kind: 'github-repository',
              repositoryId: 'R_atlas',
              url: 'https://token@github.com/ankhorage/atlas',
            },
          ],
        },
      ]),
      null
    );
  });
});

class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
}
