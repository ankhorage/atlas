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
            kind: 'package',
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
            kind: 'module',
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

  it('marks every source-owned repository node without coloring vendors or owners', () => {
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
    ).toBe(1);
    expect(firstClasses.get('react')).toBe('isVendor');
    expect(firstClasses.get('owner:example')).toBe('');
    expect(reorderedClasses).toEqual(firstClasses);
  });
});

/*** Builds selected repository nodes plus deliberately neutral owner and vendor nodes. */
function repositoryGraph(
  repositoryIds: readonly string[],
  labels: Readonly<Record<string, string>> = {}
) {
  return {
    nodes: [
      ...repositoryIds.flatMap(repositoryId => [
        repositoryNode(`repository.${repositoryId}`, repositoryId, '', labels[repositoryId]),
        repositoryNode(
          `repository.${repositoryId}.module.src`,
          repositoryId,
          `repository.${repositoryId}`,
          labels[repositoryId]
        ),
      ]),
      {
        id: 'owner:example',
        data: {
          classification: 'intrinsic' as const,
          isIntrinsic: true,
          kind: 'module' as const,
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
          kind: 'package' as const,
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
function repositoryNode(id: string, repositoryId: string, parent: string, label = repositoryId) {
  return {
    id,
    data: {
      classification: 'intrinsic' as const,
      isIntrinsic: true,
      kind: id.endsWith('.src') ? ('module' as const) : ('package' as const),
      label: id.endsWith('.src') ? `${label}/src` : label,
      name: id,
      parent,
      path: id,
      repositoryId,
    },
  };
}

/*** Reads presentation classes through the owning graph-element boundary. */
function repositoryClasses(graph: ReturnType<typeof repositoryGraph>): Map<string, string> {
  return new Map(
    createPackageGraphElements(graph).nodes.map(node => {
      if (typeof node.data.id !== 'string') throw new Error('Graph node is missing its ID.');
      return [node.data.id, normalizeClasses(node.classes)];
    })
  );
}

/*** Normalizes Cytoscape's string-or-token-list class representation for assertions. */
function normalizeClasses(classes: string | readonly string[] | undefined): string {
  return typeof classes === 'string' ? classes : (classes?.join(' ') ?? '');
}
