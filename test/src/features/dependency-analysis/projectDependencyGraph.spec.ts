import type { DependencyGraph } from '@ankhorage/dependency-graph';
import { describe, expect, it } from '@artiphishle/testosterone';

import { projectDependencyGraph } from '@/features/dependency-analysis/application/use-cases/projectDependencyGraph';

describe('[canonical dependency package projection]', () => {
  it('preserves intrinsic hierarchy, vendor metadata, weights and owner evidence', () => {
    const graph = projectDependencyGraph(createOwnerGraph());

    expect(graph.nodes.map(node => node.id).sort()).toEqual([
      '@zora/list',
      'react',
      'src',
      'src.features',
      'src.shared',
    ]);
    expect(graph.nodes.find(node => node.id === 'src')?.data).toEqual({
      classification: 'intrinsic',
      path: 'src',
      parent: '',
      label: 'src',
      name: 'src',
      isIntrinsic: true,
    });
    expect(graph.nodes.find(node => node.id === 'src.features')?.data.parent).toBe('src');
    expect(graph.nodes.find(node => node.id === 'react')?.data.classification).toBe('vendor');
    expect(graph.nodes.find(node => node.id === 'react')?.data.isIntrinsic).toBeUndefined();
    expect(graph.nodes.find(node => node.id === '@zora/list')?.data.classification).toBe('unknown');

    const vendor = graph.edges.find(
      edge => edge.source === 'src.features' && edge.target === 'react'
    );
    const intrinsic = graph.edges.find(
      edge => edge.source === 'src.features' && edge.target === 'src.shared'
    );

    expect(vendor?.data.weight).toBe(2);
    expect(vendor?.data.evidence.map(item => item.specifier)).toEqual(['react', 'react']);
    expect(intrinsic?.data.weight).toBe(1);
    expect(intrinsic?.data.evidence[0]?.classification).toBe('intrinsic');
  });
});

/*** Create owner graph data with canonical node IDs that must not leak into Atlas projection. */
function createOwnerGraph(): DependencyGraph {
  return {
    nodes: [
      {
        id: 'package:current:.',
        data: {
          kind: 'package',
          classification: 'intrinsic',
          focus: true,
          label: 'current:.',
          projectId: 'current',
          path: '.',
        },
      },
      moduleNode('src', ''),
      moduleNode('src.features', 'src'),
      moduleNode('src.shared', 'src'),
      {
        id: 'vendor:react',
        data: {
          kind: 'package',
          classification: 'vendor',
          focus: false,
          label: 'react',
          packageName: 'react',
        },
      },
      {
        id: 'unknown:@zora/list',
        data: {
          kind: 'package',
          classification: 'unknown',
          focus: false,
          label: '@zora/list',
          packageName: '@zora/list',
        },
      },
    ],
    edges: [
      {
        id: 'features->react',
        source: 'package:current:.#src.features',
        target: 'vendor:react',
        data: {
          kind: 'import',
          analyzerId: 'typescript',
          weight: 2,
          evidence: [
            dependencyEvidence('src/features/one.ts', 'react', 'vendor'),
            dependencyEvidence('src/features/two.ts', 'react', 'vendor'),
          ],
        },
      },
      {
        id: 'features->shared',
        source: 'package:current:.#src.features',
        target: 'package:current:.#src.shared',
        data: {
          kind: 'import',
          analyzerId: 'typescript',
          weight: 1,
          evidence: [dependencyEvidence('src/features/one.ts', '../shared/value', 'intrinsic')],
        },
      },
    ],
  };
}

/*** Create one canonical intrinsic module node. */
function moduleNode(path: string, parentPath: string): DependencyGraph['nodes'][number] {
  return {
    id: `package:current:.#${path}`,
    data: {
      kind: 'module',
      classification: 'intrinsic',
      focus: true,
      label: path.split('.').at(-1) ?? path,
      projectId: 'current',
      path,
      parentPath,
    },
  };
}

/*** Create one canonical dependency evidence item. */
function dependencyEvidence(
  sourceFile: string,
  specifier: string,
  classification: 'intrinsic' | 'vendor'
): DependencyGraph['edges'][number]['data']['evidence'][number] {
  return {
    sourceFile,
    specifier,
    classification,
    declarations: [],
  };
}
