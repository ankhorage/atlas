import type { PackageDependencyGraph } from '@/types/dependencyAnalysis';

/***
 * Returns dependency endpoints plus isolated leaves while excluding relationship-free containers.
 * Structural packages with descendants are navigation containers until a real endpoint is reached.
 */
export function getSelectableGraphNodeIds(graph: PackageDependencyGraph): readonly string[] {
  const connected = new Set(graph.edges.flatMap(edge => [edge.source, edge.target]));
  const nodeIds = graph.nodes.map(node => node.id);
  const nodeIdSet = new Set(nodeIds);
  const ancestors = new Set<string>();

  for (const id of nodeIds) {
    for (
      let boundary = id.lastIndexOf('.');
      boundary >= 0;
      boundary = id.lastIndexOf('.', boundary - 1)
    ) {
      const ancestor = id.slice(0, boundary);
      if (nodeIdSet.has(ancestor)) ancestors.add(ancestor);
      if (boundary === 0) break;
    }
  }

  return nodeIds.filter(id => connected.has(id) || !ancestors.has(id));
}
