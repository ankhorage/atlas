'use client';

import type { GraphViewEdge, GraphViewElementEvent, GraphViewNode } from '@zora/graph-view';
import { useMemo, useState } from 'react';

import { applyGraphInteractionPresentation } from '@/features/graph-view/adapters/inbound/react/applyGraphInteractionPresentation';
import { reduceGraphInteraction } from '@/features/graph-view/domain/reduceGraphInteraction';
import type { GraphInteractionState } from '@/types/graphInteraction';

/***
 * Own hover state while rendering the workspace-controlled logical selection declaratively.
 * Compound hover remains ignored, while selected dependency endpoints may themselves be compound.
 */
export function useGraphInteractions(
  nodes: readonly GraphViewNode[],
  edges: readonly GraphViewEdge[],
  selectedNodeIds: readonly string[]
) {
  const nodeIds = useMemo(() => new Set(nodes.map(node => node.id)), [nodes]);
  const leafIds = useMemo(() => {
    const parents = new Set(nodes.map(node => node.parentId));
    return new Set(nodes.filter(node => !parents.has(node.id)).map(node => node.id));
  }, [nodes]);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const interaction = useMemo<GraphInteractionState>(
    () => ({
      hoveredNodeId: hoveredNodeId !== null && leafIds.has(hoveredNodeId) ? hoveredNodeId : null,
      selectedNodeIds: selectedNodeIds.filter(id => nodeIds.has(id)),
    }),
    [hoveredNodeId, leafIds, nodeIds, selectedNodeIds]
  );
  const presentation = useMemo(
    () => applyGraphInteractionPresentation(nodes, edges, interaction),
    [nodes, edges, interaction]
  );

  /*** Route only approved leaf hover events to local interaction state; selection is workspace-owned. */
  const handleNodeEvent = (event: GraphViewElementEvent) => {
    if (!leafIds.has(event.id)) return;
    if (event.type !== 'pointer-enter' && event.type !== 'pointer-leave') return;
    const hoverEvent = { id: event.id, type: event.type } as const;

    setHoveredNodeId(previous => {
      const state = reduceGraphInteraction(
        {
          hoveredNodeId: previous,
          selectedNodeIds: interaction.selectedNodeIds,
        },
        hoverEvent
      );
      return state.hoveredNodeId;
    });
  };

  return { ...presentation, selectedNodeIds: interaction.selectedNodeIds, handleNodeEvent };
}
