import { describe, expect, it } from '@artiphishle/testosterone';

import { resolveGraphProjectTreeSelection } from '@/features/project-tree/application/use-cases/resolveGraphProjectTreeSelection';
import { resolveProjectTreeGraphNodeId } from '@/features/project-tree/utils/resolveProjectTreeGraphNodeId';
import type { ProjectTreeNode } from '@/types/projectTree';

describe('[graph/tree selection synchronization]', () => {
  const graphNodeIds = ['io', 'io.reflectoring', 'io.reflectoring.coderadar'];

  it('selects the exact visible structural row instead of its first dependency descendant', () => {
    const io = coderadarTree()[0];
    if (!io) throw new Error('Missing io fixture');

    expect(resolveProjectTreeGraphNodeId(io, graphNodeIds)).toBe('io');
  });

  it('does not replace an unmapped structural row with a displayed child', () => {
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

    expect(resolveProjectTreeGraphNodeId(structural, ['app.first', 'app.second'])).toBeNull();
  });

  it('selects an exact nested folder such as src/features/accordion/adapters', () => {
    const adapters: ProjectTreeNode = {
      id: 'directory:src/features/accordion/adapters',
      graphPackage: 'src.features.accordion.adapters',
      kind: 'directory',
      label: 'adapters',
    };

    expect(resolveProjectTreeGraphNodeId(adapters, ['src.features.accordion.adapters'])).toBe(
      'src.features.accordion.adapters'
    );
  });

  it('maps structural GraphView packages to their matching filesystem rows without descending', () => {
    const tree = coderadarTree();

    expect(resolveGraphProjectTreeSelection(tree, 'io', graphNodeIds)?.id).toBe('directory:io');
    expect(resolveGraphProjectTreeSelection(tree, 'io.reflectoring', graphNodeIds)?.id).toBe(
      'directory:io/reflectoring'
    );
    expect(resolveGraphProjectTreeSelection(tree, 'io.reflectoring.coderadar', graphNodeIds)?.id).toBe(
      'directory:io/reflectoring/coderadar'
    );
  });
});

/*** Build a regression tree whose source containers previously collapsed to the deepest package. */
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
