import { arraysEqual, dedupeBy } from '@ankhorage/utility/array';
import { useState } from 'react';

import { getProjectTreeAncestorIds } from '@/features/project-tree/utils/getProjectTreeAncestorIds';
import type { ProjectTreeNode } from '@/types/projectTree';

/*** Open the workspace root, preserve manual expansion, and reveal ancestors required by selected rows. */
export function useProjectTreeExpansion(
  nodes: readonly ProjectTreeNode[],
  selectedIds: readonly string[]
) {
  const [state, setState] = useState<ProjectTreeExpansionState>(() => ({
    nodes,
    selectedIds,
    ids: revealSelections(nodes, selectedIds, initiallyExpandedIds(nodes)),
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

/*** Keep the workspace entry visible without expanding arbitrary source folders. */
function initiallyExpandedIds(nodes: readonly ProjectTreeNode[]): readonly string[] {
  return nodes.flatMap(node => [
    ...(node.children?.length ? [node.id] : []),
    ...virtualDescendantIds(node),
  ]);
}

/*** Expand owner and repository presentation roots so the repository's top folder is visible. */
function virtualDescendantIds(node: ProjectTreeNode): readonly string[] {
  if (node.children === undefined) return [];
  return node.children.flatMap(child =>
    child.kind === 'virtual' && child.children?.length
      ? [child.id, ...virtualDescendantIds(child)]
      : []
  );
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
