import type { EdgeDefinition, ElementsDefinition, NodeDefinition } from 'cytoscape';

import type { PackageCycleDetail } from '@/types/audit';

/***
 * Temporarily restores the complete selected cycle from canonical elements without changing any
 * persisted presentation filter. Parent compounds are restored with their evidence so GraphView
 * retains valid hierarchy and viewport ownership.
 */
export function revealCycleProjection(
  elements: ElementsDefinition,
  visible: ElementsDefinition,
  cycle: PackageCycleDetail | undefined
): ElementsDefinition {
  if (cycle === undefined) return visible;
  const cycleEdges = new Set(cycle.edges.map(edge => `${edge.from}->${edge.to}`));
  const revealedEdges = elements.edges.filter(edge =>
    cycleEdges.has(`${String(edge.data.source)}->${String(edge.data.target)}`)
  );
  if (revealedEdges.length === 0) return visible;

  const nodesById = new Map(elements.nodes.map(node => [readNodeId(node), node]));
  const revealedNodeIds = new Set(
    revealedEdges.flatMap(edge => [String(edge.data.source), String(edge.data.target)])
  );
  addParentNodeIds(revealedNodeIds, nodesById);
  const visibleNodeIds = new Set(visible.nodes.map(readNodeId));
  const visibleEdgeIds = new Set(visible.edges.map(readEdgeId));

  return {
    nodes: [
      ...visible.nodes,
      ...[...revealedNodeIds].flatMap(id => {
        const node = nodesById.get(id);
        return node === undefined || visibleNodeIds.has(id) ? [] : [node];
      }),
    ],
    edges: [
      ...visible.edges,
      ...revealedEdges.filter(edge => !visibleEdgeIds.has(readEdgeId(edge))),
    ],
  };
}

/*** Include compound ancestors required by Cytoscape for each temporarily restored cycle node. */
function addParentNodeIds(ids: Set<string>, nodesById: ReadonlyMap<string, NodeDefinition>): void {
  for (const id of ids) {
    const parent = nodesById.get(id)?.data.parent;
    if (typeof parent === 'string' && parent !== '' && !ids.has(parent)) {
      ids.add(parent);
      addParentNodeIds(ids, nodesById);
    }
  }
}

/*** Read a stable Cytoscape node identity. */
function readNodeId(node: NodeDefinition): string {
  return String(node.data.id);
}

/*** Prefer owner-supplied edge identity and retain a deterministic fallback for fixtures. */
function readEdgeId(edge: EdgeDefinition): string {
  return typeof edge.data.id === 'string'
    ? edge.data.id
    : `${String(edge.data.source)}->${String(edge.data.target)}`;
}
