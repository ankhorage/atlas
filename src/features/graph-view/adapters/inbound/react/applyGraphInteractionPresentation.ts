import type { GraphViewEdge, GraphViewNode } from '@ankhorage/zora/web/graph-view';

import { getDependencyHighlightClasses } from '@/features/graph-view/domain/getDependencyHighlightClasses';
import type { GraphInteractionState } from '@/types/graphInteraction';

/***
 * Projects Atlas interaction classes into the public GraphView presentation contract.
 * @performance Reuse prepared model data and styles; interaction never rebuilds package/cycle indexes.
 * Always start from the base model so pointer exit removes transient classes and preserves audit data.
 */
export function applyGraphInteractionPresentation(
  nodes: readonly GraphViewNode[],
  edges: readonly GraphViewEdge[],
  state: GraphInteractionState,
  parentById: ReadonlyMap<string, string>
) {
  const activeIds = new Set(
    state.hoveredNodeId === null ? state.selectedNodeIds : [state.hoveredNodeId]
  );
  if (activeIds.size === 0) return { nodes, edges };
  const classes = getDependencyHighlightClasses(
    nodes.map(node => node.id),
    edges,
    activeIds,
    parentById
  );
  return {
    nodes: nodes.map((node, index) => ({
      ...node,
      classes: [node.classes, classes.nodeClasses.at(index)].filter(Boolean).join(' '),
    })),
    edges: edges.map((edge, index) => ({
      ...edge,
      classes: [edge.classes, classes.edgeClasses.at(index)].filter(Boolean).join(' '),
    })),
  };
}
