import { arraysEqual, dedupeBy } from '@ankhorage/utility/array';
import { useState } from 'react';

import { getProjectTreeAncestorIds } from '@/features/project-tree/utils/getProjectTreeAncestorIds';
import type { ProjectTreeNode } from '@/types/projectTree';

/*** Open the first top-level folder, preserve manual expansion, and reveal selected rows. */
export function useProjectTreeExpansion(
  nodes: readonly ProjectTreeNode[],
  selectedIds: readonly string[]
) {
  const [state, setState] = useState<ProjectTreeExpansionState>(() => ({
    nodes,
    selectedIds,
    ids: revealSelections(nodes, selectedIds, initialExpandedIds(nodes)),
  }));
  if (state.nodes !== nodes || !arraysEqual(state.selectedIds, selectedIds)) {
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

/*** Select the first visible folder as the useful initial entry point without expanding the whole tree. */
function initialExpandedIds(nodes: readonly ProjectTreeNode[]): readonly string[] {
  const topFolder = nodes.find(node => node.children !== undefined && node.children.length > 0);
  return topFolder === undefined ? [] : [topFolder.id];
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
  return dedupeBy([...ids, ...requiredAncestorIds], value => value);
}

interface ProjectTreeExpansionState {
  readonly nodes: readonly ProjectTreeNode[];
  readonly selectedIds: readonly string[];
  readonly ids: readonly string[];
}
