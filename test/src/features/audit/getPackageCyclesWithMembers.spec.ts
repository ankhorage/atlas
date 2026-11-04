import { describe, expect, it } from '@artiphishle/testosterone';

import { getPackageCyclesWithMembers } from '@/features/audit/application/use-cases/getPackageCyclesWithMembers';
import { getCycleId } from '@/features/audit/utils/cycleVisualization';
import type { PackageDependencyGraph } from '@/types/dependencyAnalysis';

describe('[project-aware package cycles]', () => {
  it('keeps same-named modules distinct and classifies intra-project and cross-project cycles once', () => {
    const result = getPackageCyclesWithMembers({}, graph());

    expect(result.cycles).toHaveLength(2);
    expect(result.cycles.map(cycle => cycle.projects?.map(project => project.label))).toEqual([
      ['Atlas'],
      ['ZORA', 'Runtime'],
    ]);
    expect(result.cycles.map(cycle => cycle.displayPackages)).toEqual([
      ['Atlas', 'src', 'Atlas'],
      ['Runtime', 'ZORA', 'Runtime'],
    ]);
    expect(new Set(result.cycles.map(getCycleId)).size).toBe(2);
  });

  it('keeps stable cycle identities when canonical repository order changes', () => {
    const forward = getPackageCyclesWithMembers({}, graph()).cycles.map(getCycleId).sort();
    const reversed = getPackageCyclesWithMembers(
      {},
      { nodes: [...graph().nodes].reverse(), edges: [...graph().edges].reverse() }
    )
      .cycles.map(getCycleId)
      .sort();

    expect(reversed).toEqual(forward);
  });

  it('reports no findings for acyclic repositories', () => {
    const acyclic: PackageDependencyGraph = {
      nodes: graph().nodes,
      edges: [edge('atlas-root', 'atlas-src')],
    };

    expect(getPackageCyclesWithMembers({}, acyclic).cycles).toEqual([]);
  });
});

/*** Creates two genuine cycles plus same-named modules that never form a false cycle. */
function graph(): PackageDependencyGraph {
  return {
    nodes: [
      node('atlas-root', 'Atlas', '1', 'Atlas'),
      node('atlas-src', 'src', '1', 'Atlas'),
      node('zora-root', 'ZORA', '2', 'ZORA'),
      node('zora-src', 'src', '2', 'ZORA'),
      node('runtime-root', 'Runtime', '3', 'Runtime'),
    ],
    edges: [
      edge('atlas-root', 'atlas-src'),
      edge('atlas-src', 'atlas-root'),
      edge('zora-root', 'runtime-root'),
      edge('runtime-root', 'zora-root'),
    ],
  };
}

/*** Creates one repository-scoped canonical package node. */
function node(
  id: string,
  label: string,
  repositoryId: string,
  repositoryLabel: string
): PackageDependencyGraph['nodes'][number] {
  return {
    id,
    data: {
      classification: 'intrinsic',
      isIntrinsic: true,
      label,
      name: label,
      parent: '',
      path: id,
      repositoryId,
      repositoryLabel,
    },
  };
}

/*** Creates one directed dependency edge with preserved source evidence shape. */
function edge(source: string, target: string): PackageDependencyGraph['edges'][number] {
  return { id: `${source}->${target}`, source, target, data: { evidence: [], weight: 1 } };
}
