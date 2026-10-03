'use client';

import type { GraphViewEdge, GraphViewElementEvent, GraphViewNode } from '@zora/graph-view';
import { useMemo, useState } from 'react';

import { applyGraphInteractionPresentation } from '@/features/graph-view/adapters/inbound/react/applyGraphInteractionPresentation';
import { reduceGraphInteraction } from '@/features/graph-view/domain/reduceGraphInteraction';
import type { GraphInteractionState } from '@/types/graphInteraction';

/***
 * Owns hover state while rendering the workspace-controlled logical selection declaratively.
 * Compound hover remains ignored, while a selected dependency endpoint may itself be compound.
 */
export function useGraphInteractions(
  nodes: readonly GraphViewNode[],
  edges: readonly GraphViewEdge[],
  selectedNodeId: string | null
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
      selectedNodeIds:
        selectedNodeId === null || !nodeIds.has(selectedNodeId) ? [] : [selectedNodeId],
    }),
    [hoveredNodeId, leafIds, nodeIds, selectedNodeId]
  );
  const presentation = useMemo(
    () => applyGraphInteractionPresentation(nodes, edges, interaction),
    [nodes, edges, interaction]
  );

  /*** Route only approved leaf hover events to local interaction state; selection is workspace-owned. */
  const handleNodeEvent = (event: GraphViewElementEvent) => {
    if (
      !leafIds.has(event.id) ||
      (event.type !== 'pointer-enter' && event.type !== 'pointer-leave')
    ) {
      return;
    }

    setHoveredNodeId(previous => {
      const state = reduceGraphInteraction(
        {
          hoveredNodeId: previous,
          selectedNodeIds: interaction.selectedNodeIds,
        },
        event
      );
      return state.hoveredNodeId;
    });
  };

  return { ...presentation, handleNodeEvent };
}
