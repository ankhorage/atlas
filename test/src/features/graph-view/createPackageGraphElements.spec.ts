import { describe, expect, it } from '@artiphishle/testosterone';

import { createPackageGraphElements } from '@/features/graph-view/adapters/inbound/cytoscape/createPackageGraphElements';

describe('[package graph Cytoscape presentation]', () => {
  it('marks only owner-declared workspace roots without changing intrinsic classification', () => {
    const elements = createPackageGraphElements({
      nodes: [
        {
          id: 'packages.dashboard',
          data: {
            classification: 'intrinsic',
            path: 'packages.dashboard',
            parent: 'packages',
            label: 'dashboard',
            name: 'dashboard',
            isIntrinsic: true,
            isWorkspaceRoot: true,
          },
        },
        {
          id: 'packages.dashboard.src',
          data: {
            classification: 'intrinsic',
            path: 'packages.dashboard.src',
            parent: 'packages.dashboard',
            label: 'src',
            name: 'src',
            isIntrinsic: true,
          },
        },
      ],
      edges: [],
    });

    expect(elements.nodes.map(node => [node.data.id, node.classes])).toEqual([
      ['packages.dashboard', ['isWorkspaceRoot']],
      ['packages.dashboard.src', []],
    ]);
  });

  it('keeps repository colors stable across reordered sources without coloring vendors or owners', () => {
    const first = createPackageGraphElements(
      repositoryGraph(['R_atlas', 'R_zora', 'R_disconnected'])
    );
    const reordered = createPackageGraphElements(
      repositoryGraph(['R_disconnected', 'R_atlas', 'R_zora'])
    );
    const firstClasses = new Map(
      first.nodes.map(node => [node.data.id, normalizeClasses(node.classes)])
    );
    const reorderedClasses = new Map(
      reordered.nodes.map(node => [node.data.id, normalizeClasses(node.classes)])
    );

    expect(firstClasses.get('repository.R_atlas')?.startsWith('repositoryColor')).toBe(true);
    expect(firstClasses.get('repository.R_atlas.module.src')).toBe(
      firstClasses.get('repository.R_atlas')
    );
    expect(firstClasses.get('repository.R_zora.module.src')).toBe(
      firstClasses.get('repository.R_zora')
    );
    expect(
      new Set(
        ['R_atlas', 'R_zora', 'R_disconnected'].map(id => firstClasses.get(`repository.${id}`))
      ).size
    ).toBe(3);
    expect(firstClasses.get('react')).toBe('isVendor');
    expect(firstClasses.get('owner:example')).toBe('');
    expect(reorderedClasses).toEqual(firstClasses);
  });
});

/*** Builds selected repository nodes plus deliberately neutral owner and vendor nodes. */
function repositoryGraph(repositoryIds: readonly string[]) {
  return {
    nodes: [
      ...repositoryIds.flatMap(repositoryId => [
        repositoryNode(`repository.${repositoryId}`, repositoryId, ''),
        repositoryNode(
          `repository.${repositoryId}.module.src`,
          repositoryId,
          `repository.${repositoryId}`
        ),
      ]),
      {
        id: 'owner:example',
        data: {
          classification: 'intrinsic' as const,
          isIntrinsic: true,
          label: 'example',
          name: 'example',
          parent: '',
          path: 'owner:example',
        },
      },
      {
        id: 'react',
        data: {
          classification: 'vendor' as const,
          label: 'react',
          name: 'react',
          parent: '',
          path: 'react',
          repositoryId: 'R_atlas',
        },
      },
    ],
    edges: [],
  };
}

/*** Creates one first-party node whose identity is independent from its display path. */
function repositoryNode(id: string, repositoryId: string, parent: string) {
  return {
    id,
    data: {
      classification: 'intrinsic' as const,
      isIntrinsic: true,
      label: id.includes('R_zora')
        ? 'package-name-unlike-slug'
        : id.endsWith('.src')
          ? 'src'
          : repositoryId,
      name: id,
      parent,
      path: id,
      repositoryId,
    },
  };
}

/*** Normalizes Cytoscape's string-or-token-list class representation for assertions. */
function normalizeClasses(classes: string | readonly string[] | undefined): string {
  return typeof classes === 'string' ? classes : (classes?.join(' ') ?? '');
}
