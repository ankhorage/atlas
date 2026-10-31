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
});
