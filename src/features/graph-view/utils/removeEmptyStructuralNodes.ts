import type { ElementsDefinition } from 'cytoscape';

import { isIntrinsicGraphNode } from '@/features/graph-view/utils/isIntrinsicGraphNode';

/***
 * Omits relationship-free containers in flat views, but preserves actual isolated leaf packages.
 * @performance Index connected endpoints and ancestors once instead of scanning the graph per node.
 */
export function removeEmptyStructuralNodes(elements: ElementsDefinition): ElementsDefinition {
  const connected = new Set(elements.edges.flatMap(edge => [edge.data.source, edge.data.target]));
  const ancestors = new Set<string>();
  for (const node of elements.nodes.filter(isIntrinsicGraphNode)) {
    const segments = String(node.data.id ?? '').split('.');
    for (let length = 1; length < segments.length; length += 1) {
      ancestors.add(segments.slice(0, length).join('.'));
    }
  }
  return {
    nodes: elements.nodes.filter(
      node =>
        !isIntrinsicGraphNode(node) ||
        !ancestors.has(String(node.data.id)) ||
        connected.has(String(node.data.id))
    ),
    edges: elements.edges,
  };
}
