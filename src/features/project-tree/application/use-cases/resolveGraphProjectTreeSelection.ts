import { findProjectTreeNodeByGraphPackage } from '@/features/project-tree/utils/findProjectTreeNodeByGraphPackage';
import { resolveProjectTreeGraphNodeId } from '@/features/project-tree/utils/resolveProjectTreeGraphNodeId';
import type { ProjectTreeNode } from '@/types/projectTree';

/*** Maps one graph node to the exact visible TreeView row that represents its package/path. */
export function resolveGraphProjectTreeSelection(
  nodes: readonly ProjectTreeNode[],
  graphNodeId: string,
  graphNodeIds: readonly string[]
): ProjectTreeNode | null {
  const normalizedId = normalizeGraphPackage(graphNodeId);
  if (!graphNodeIds.includes(normalizedId)) return null;
  return (
    findProjectTreeNodeByResolvedGraphId(nodes, normalizedId, graphNodeIds) ??
    findProjectTreeNodeByGraphPackage(nodes, normalizedId)
  );
}

/*** Finds a row by its exact graph identity without substituting a descendant. */
function findProjectTreeNodeByResolvedGraphId(
  nodes: readonly ProjectTreeNode[],
  graphNodeId: string,
  graphNodeIds: readonly string[]
): ProjectTreeNode | null {
  for (const node of nodes) {
    if (resolveProjectTreeGraphNodeId(node, graphNodeIds) === graphNodeId) return node;
    const nested = node.children
      ? findProjectTreeNodeByResolvedGraphId(node.children, graphNodeId, graphNodeIds)
      : null;
    if (nested !== null) return nested;
  }
  return null;
}

/*** Normalize filesystem-style package separators to the graph identity representation. */
function normalizeGraphPackage(value: string): string {
  return value.replaceAll('/', '.').replace(/^\.+|\.+$/g, '');
}
