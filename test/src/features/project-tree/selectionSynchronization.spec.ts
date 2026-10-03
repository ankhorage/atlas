import { describe, expect, it } from '@artiphishle/testosterone';

import { getSelectableGraphNodeIds } from '@/features/graph-view/domain/getSelectableGraphNodeIds';
import { resolveGraphProjectTreeSelection } from '@/features/project-tree/application/use-cases/resolveGraphProjectTreeSelection';
import { resolveProjectTreeSelection } from '@/features/project-tree/application/use-cases/resolveProjectTreeSelection';
import type { PackageDependencyGraph } from '@/types/dependencyAnalysis';
import type { ProjectTreeNode } from '@/types/projectTree';

describe('[graph/tree selection synchronization]', () => {
  it('treats relationship-free containers as structural while preserving dependency endpoints and leaves', () => {
    const graph = createGraph(
      ['io', 'io.reflectoring', 'io.reflectoring.coderadar', 'lonely'],
      [['io.reflectoring.coderadar', 'lonely']]
    );

    expect(getSelectableGraphNodeIds(graph)).toEqual(['io.reflectoring.coderadar', 'lonely']);
  });

  it('resolves the io/reflectoring/coderadar filesystem chain to the deepest graph-backed directory', () => {
    const io = coderadarTree()[0];
    if (!io) throw new Error('Missing io fixture');

    const resolved = resolveProjectTreeSelection(io, ['io.reflectoring.coderadar']);

    expect(resolved?.id).toBe('directory:io/reflectoring/coderadar');
    expect(resolved?.graphPackage).toBe('io.reflectoring.coderadar');
  });

  it('uses displayed child order for structural rows without a direct graph package', () => {
    const structural: ProjectTreeNode = {
      id: 'directory:src',
      graphPackage: '',
      kind: 'directory',
      label: 'src',
      children: [
        { id: 'directory:first', graphPackage: 'app.first', kind: 'directory', label: 'first' },
        { id: 'directory:second', graphPackage: 'app.second', kind: 'directory', label: 'second' },
      ],
    };

    expect(resolveProjectTreeSelection(structural, ['app.first', 'app.second'])?.id).toBe(
      'directory:first'
    );
  });

  it('maps structural GraphView packages through the same descendant policy into TreeView', () => {
    const tree = coderadarTree();

    expect(resolveGraphProjectTreeSelection(tree, 'io', ['io.reflectoring.coderadar'])?.id).toBe(
      'directory:io/reflectoring/coderadar'
    );
    expect(
      resolveGraphProjectTreeSelection(tree, 'io.reflectoring.coderadar', [
        'io.reflectoring.coderadar',
      ])?.id
    ).toBe('directory:io/reflectoring/coderadar');
  });
});

/*** Build the regression tree where several filesystem containers represent one Java package. */
function coderadarTree(): readonly ProjectTreeNode[] {
  return [
    {
      id: 'directory:io',
      graphPackage: 'io.reflectoring.coderadar',
      kind: 'directory',
      label: 'io',
      children: [
        {
          id: 'directory:io/reflectoring',
          graphPackage: 'io.reflectoring.coderadar',
          kind: 'directory',
          label: 'reflectoring',
          children: [
            {
              id: 'directory:io/reflectoring/coderadar',
              graphPackage: 'io.reflectoring.coderadar',
              kind: 'directory',
              label: 'coderadar',
              children: [
                {
                  id: 'file:io/reflectoring/coderadar/App.java',
                  graphPackage: 'io.reflectoring.coderadar',
                  kind: 'file',
                  label: 'App.java',
                },
              ],
            },
          ],
        },
      ],
    },
  ];
}

/*** Create the minimal package graph shape required by endpoint-selection tests. */
function createGraph(
  ids: readonly string[],
  pairs: readonly (readonly [string, string])[]
): PackageDependencyGraph {
  return {
    nodes: ids.map(id => ({
      id,
      data: {
        classification: 'intrinsic',
        path: id,
        parent: id.includes('.') ? id.split('.').slice(0, -1).join('.') : '',
        label: id,
        name: id,
        isIntrinsic: true,
      },
    })),
    edges: pairs.map(([source, target]) => ({
      id: `${source}->${target}`,
      source,
      target,
      data: { weight: 1, evidence: [] },
    })),
  };
}
