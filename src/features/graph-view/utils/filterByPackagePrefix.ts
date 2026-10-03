import { isIntrinsicGraphNode } from '@/features/graph-view/utils/isIntrinsicGraphNode';

/***
 * Filters project descendants while retaining their adjacent external dependency endpoints.
 * @performance Use endpoint sets to retain adjacent vendors without per-vendor edge scans.
 */
export function filterByPackagePrefix(
  allElements: cytoscape.ElementsDefinition,
  packagePrefix: string
): cytoscape.ElementsDefinition {
  const normalizedPrefix = packagePrefix.replace(/\.+$/, '');
  if (!normalizedPrefix) return allElements;

  const descendantPrefix = normalizedPrefix + '.';
  const projectNodes = allElements.nodes.filter(node => {
    const id = node.data.id ?? '';
    return isIntrinsicGraphNode(node) && id.startsWith(descendantPrefix);
  });
  const projectIds = new Set(projectNodes.map(node => node.data.id));
  const connectedIds = new Set(
    allElements.edges.flatMap(edge =>
      projectIds.has(edge.data.source) || projectIds.has(edge.data.target)
        ? [edge.data.source, edge.data.target]
        : []
    )
  );
  const allowedNodes = allElements.nodes.filter(
    node =>
      projectIds.has(node.data.id) ||
      (!isIntrinsicGraphNode(node) && connectedIds.has(String(node.data.id)))
  );
  const allowedNodeIds = new Set(allowedNodes.map(node => node.data.id));
  const allowedEdges = allElements.edges.filter(
    edge => allowedNodeIds.has(edge.data.source) && allowedNodeIds.has(edge.data.target)
  );

  return {
    nodes: allowedNodes,
    edges: allowedEdges,
  };
}
