import { useState } from 'react';

import { getProjectTreeAncestorIds } from '@/features/project-tree/utils/getProjectTreeAncestorIds';
import type { ProjectTreeNode } from '@/types/projectTree';

/*** Preserve manual folder expansion while revealing ancestors required by every selected row. */
export function useProjectTreeExpansion(
  nodes: readonly ProjectTreeNode[],
  selectedIds: readonly string[]
) {
  const [state, setState] = useState(() => ({
    nodes,
    selectedIds,
    ids: revealSelections(
      nodes,
      selectedIds,
      nodes.filter(node => node.kind === 'directory').map(node => node.id)
    ),
  }));
  if (state.nodes !== nodes || !areIdsEqual(state.selectedIds, selectedIds)) {
    setState({
      nodes,
      selectedIds,
      ids: revealSelections(nodes, selectedIds, state.ids),
    });
  }

  return {
    expandedIds: state.ids,
    onExpandedChange: (ids: readonly string[]) => setState({ nodes, selectedIds, ids }),
  };
}

/*** Add only the ancestors required to reveal all selections without opening selected folders. */
function revealSelections(
  nodes: readonly ProjectTreeNode[],
  selectedIds: readonly string[],
  ids: readonly string[]
) {
  const requiredAncestorIds = selectedIds.flatMap(selectedId =>
    getProjectTreeAncestorIds(nodes, selectedId)
  );
  return [...new Set([...ids, ...requiredAncestorIds])];
}

/*** Compare selected row identities by value so equal controlled arrays keep expansion state stable. */
function areIdsEqual(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
