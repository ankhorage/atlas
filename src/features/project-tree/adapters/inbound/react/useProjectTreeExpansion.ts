import { useState } from 'react';

import { getProjectTreeAncestorIds } from '@/features/project-tree/utils/getProjectTreeAncestorIds';
import type { ProjectTreeNode } from '@/types/projectTree';

/*** Preserves manual folder expansion while revealing only ancestors required by selection. */
export function useProjectTreeExpansion(
  nodes: readonly ProjectTreeNode[],
  selectedId: string | null
) {
  const [state, setState] = useState(() => ({
    nodes,
    selectedId,
    ids: revealSelection(
      nodes,
      selectedId,
      nodes.filter(node => node.kind === 'directory').map(node => node.id)
    ),
  }));
  if (state.nodes !== nodes || state.selectedId !== selectedId) {
    setState({ nodes, selectedId, ids: revealSelection(nodes, selectedId, state.ids) });
  }

  return {
    expandedIds: state.ids,
    onExpandedChange: (ids: readonly string[]) => setState({ nodes, selectedId, ids }),
  };
}

/*** Adds only the ancestors required to reveal a selection without opening the selected folder. */
function revealSelection(
  nodes: readonly ProjectTreeNode[],
  selectedId: string | null,
  ids: readonly string[]
) {
  if (selectedId === null) return ids;
  return [...new Set([...ids, ...getProjectTreeAncestorIds(nodes, selectedId)])];
}
