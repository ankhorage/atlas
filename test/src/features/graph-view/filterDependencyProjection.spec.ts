import { describe, expect, it } from '@artiphishle/testosterone';
import type { ElementsDefinition } from 'cytoscape';

import { filterDependencyProjection } from '@/features/graph-view/utils/filterDependencyProjection';

const ALL_KINDS = new Set([
  'dependency',
  'devDependency',
  'peerDependency',
  'optionalDependency',
] as const);

describe('[dependency projection filters]', () => {
  it('matches the canonical dependency package identity rather than a repository graph id', () => {
    const result = filterDependencyProjection(elements(), {
      enabledKinds: ALL_KINDS,
      packagePrefix: '@ankhorage/',
    });

    expect(result.nodes.map(node => node.data.id)).toEqual([
      'repository.123',
      'repository.456',
      'vendor.lodash',
    ]);
    expect(result.edges.map(edge => edge.data.target)).toEqual(['repository.456']);
  });

  it('keeps all evidence and aggregate weights when every declaration kind is enabled', () => {
    const result = filterDependencyProjection(elements(), {
      enabledKinds: ALL_KINDS,
      packagePrefix: '',
    });

    expect(result.edges).toHaveLength(2);
    expect(result.edges[0]?.data.weight).toBe(2);
    expect(result.edges[0]?.data.evidence).toEqual(elements().edges[0]?.data.evidence);
  });

  it('retains only matching declaration evidence and preserves imports with no declaration kind', () => {
    const result = filterDependencyProjection(elements(), {
      enabledKinds: new Set(['peerDependency'] as const),
      packagePrefix: '',
    });

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]?.data.weight).toBe(2);
    expect(result.edges[0]?.data.evidence).toEqual([
      {
        sourceFile: 'src/a.ts',
        specifier: '@ankhorage/runtime',
        classification: 'vendor',
        declarations: [{ kind: 'peerDependency', range: '^1.0.0' }],
      },
      {
        sourceFile: 'src/internal.ts',
        specifier: './internal',
        classification: 'intrinsic',
        declarations: [],
      },
    ]);
  });

  it('does not hide disconnected selected projects while edges are filtered away', () => {
    const result = filterDependencyProjection(elements(), {
      enabledKinds: new Set(),
      packagePrefix: '@ankhorage/',
    });

    expect(result.nodes).toHaveLength(3);
    expect(result.edges.map(edge => edge.data.weight)).toEqual([1]);
    expect(result.edges[0]?.data.evidence).toEqual([
      {
        sourceFile: 'src/internal.ts',
        specifier: './internal',
        classification: 'intrinsic',
        declarations: [],
      },
    ]);
  });
});

/*** Supplies distinct graph IDs and package identities so prefix behavior cannot use presentation names. */
function elements(): ElementsDefinition {
  return {
    nodes: [
      { data: { id: 'repository.123', name: 'atlas' } },
      { data: { id: 'repository.456', name: '@ankhorage/runtime' } },
      { data: { id: 'vendor.lodash', name: 'lodash' } },
    ],
    edges: [
      {
        data: {
          id: 'atlas-runtime',
          source: 'repository.123',
          target: 'repository.456',
          weight: 2,
          evidence: [
            {
              sourceFile: 'src/a.ts',
              specifier: '@ankhorage/runtime',
              classification: 'vendor',
              declarations: [
                { kind: 'dependency', range: '^1.0.0' },
                { kind: 'peerDependency', range: '^1.0.0' },
              ],
            },
            {
              sourceFile: 'src/internal.ts',
              specifier: './internal',
              classification: 'intrinsic',
              declarations: [],
            },
          ],
        },
      },
      {
        data: {
          id: 'atlas-lodash',
          source: 'repository.123',
          target: 'vendor.lodash',
          weight: 1,
          evidence: [
            {
              sourceFile: 'src/b.ts',
              specifier: 'lodash',
              classification: 'vendor',
              declarations: [{ kind: 'devDependency', range: '^4.0.0' }],
            },
          ],
        },
      },
    ],
  };
}
