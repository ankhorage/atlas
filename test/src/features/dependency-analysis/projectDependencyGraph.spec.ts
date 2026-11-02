import { resolve } from 'node:path';

import type { DependencyGraph } from '@ankhorage/dependency-graph';
import { describe, expect, it } from '@artiphishle/testosterone';

import { projectDependencyGraph } from '@/features/dependency-analysis/application/use-cases/projectDependencyGraph';
import { readProjectSnapshotAsync } from '@/features/project-analysis/composition/readProjectSnapshotAsync';

describe('[canonical dependency package projection]', () => {
  it('preserves an owner-detected nested workspace root from a representative fixture', async () => {
    const snapshot = await readProjectSnapshotAsync(
      resolve('test/fixtures/typescript/nested-workspace')
    );
    const workspaceRoot = snapshot.packageGraph.nodes.find(
      node => node.id === '@fixture/dashboard'
    );

    expect(workspaceRoot?.data.isIntrinsic).toBe(true);
    expect(workspaceRoot?.data.isWorkspaceRoot).toBe(true);
  });

  it('preserves intrinsic hierarchy, vendor metadata, weights and owner evidence', () => {
    const graph = projectDependencyGraph(createOwnerGraph());

    expect(graph.nodes.map(node => node.id).sort()).toEqual([
      '@zora/list',
      'react',
      'src',
      'src.features',
      'src.shared',
      'workspace.dashboard',
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
    expect(
      graph.nodes.find(node => node.id === 'src.features')?.data.isWorkspaceRoot
    ).toBeUndefined();
    const workspaceRoot = graph.nodes.find(node => node.id === 'workspace.dashboard')?.data;
    expect(workspaceRoot?.classification).toBe('intrinsic');
    expect(workspaceRoot?.isIntrinsic).toBe(true);
    expect(workspaceRoot?.isWorkspaceRoot).toBe(true);
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

  it('keeps identical module paths distinct across immutable repository identities', () => {
    const graph: DependencyGraph = {
      nodes: [
        repositoryRoot('101', 'first'),
        repositoryModule('101', 'src.shared'),
        repositoryRoot('202', 'second'),
        repositoryModule('202', 'src.shared'),
      ],
      edges: [
        {
          id: 'first-to-second',
          source: 'package:101:.#src.shared',
          target: 'package:202:.#src.shared',
          data: {
            kind: 'import',
            analyzerId: 'typescript',
            weight: 1,
            evidence: [dependencyEvidence('src/shared.ts', '@scope/second', 'intrinsic')],
          },
        },
      ],
    };

    const projected = projectDependencyGraph(
      graph,
      new Map([
        ['101', { id: '101', label: 'renamed-first' }],
        ['202', { id: '202', label: 'renamed-second' }],
      ])
    );

    expect(projected.nodes.map(node => node.id).sort()).toEqual([
      'repository.101',
      'repository.101.module.src.shared',
      'repository.202',
      'repository.202.module.src.shared',
    ]);
    expect(projected.nodes.find(node => node.id === 'repository.101')?.data.label).toBe(
      'renamed-first'
    );
    expect(projected.edges).toEqual([
      {
        id: 'repository.101.module.src.shared->repository.202.module.src.shared',
        source: 'repository.101.module.src.shared',
        target: 'repository.202.module.src.shared',
        data: {
          weight: 1,
          evidence: [dependencyEvidence('src/shared.ts', '@scope/second', 'intrinsic')],
        },
      },
    ]);
  });
});

/*** Create the canonical focus package for one independently selected GitHub repository. */
function repositoryRoot(projectId: string, label: string): DependencyGraph['nodes'][number] {
  return {
    id: `package:${projectId}:.`,
    data: {
      kind: 'package',
      classification: 'intrinsic',
      focus: true,
      label,
      projectId,
      path: '.',
    },
  };
}

/*** Create one project-local module whose visible path intentionally collides with another project. */
function repositoryModule(projectId: string, path: string): DependencyGraph['nodes'][number] {
  return {
    id: `package:${projectId}:.#${path}`,
    data: {
      kind: 'module',
      classification: 'intrinsic',
      focus: true,
      label: path.split('.').at(-1) ?? path,
      projectId,
      path,
      parentPath: path.split('.').slice(0, -1).join('.'),
    },
  };
}

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
        id: 'package:current:packages/dashboard',
        data: {
          kind: 'package',
          classification: 'intrinsic',
          focus: true,
          label: 'workspace.dashboard',
          packageName: 'workspace.dashboard',
          projectId: 'current',
          path: 'packages/dashboard',
        },
      },
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
