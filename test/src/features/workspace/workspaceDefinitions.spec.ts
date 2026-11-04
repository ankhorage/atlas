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
  },
};

describe('[workspace definitions]', () => {
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
