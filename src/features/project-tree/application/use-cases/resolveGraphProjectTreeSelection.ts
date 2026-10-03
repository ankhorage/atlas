import { resolveProjectTreeSelection } from '@/features/project-tree/application/use-cases/resolveProjectTreeSelection';
import { findProjectTreeNodeByGraphPackage } from '@/features/project-tree/utils/findProjectTreeNodeByGraphPackage';
import type { ProjectTreeNode } from '@/types/projectTree';

/***
 * Maps a selected graph package onto the canonical TreeView row using the same descendant policy.
 * Direct endpoints prefer their deepest exact tree representation; structural nodes resolve below it.
 */
export function resolveGraphProjectTreeSelection(
  nodes: readonly ProjectTreeNode[],
  graphNodeId: string,
  selectableGraphNodeIds: readonly string[]
): ProjectTreeNode | null {
  const normalizedId = normalizeGraphPackage(graphNodeId);
  const selectable = new Set(selectableGraphNodeIds);

  if (selectable.has(normalizedId)) {
    const exact = findProjectTreeNodeByGraphPackage(nodes, normalizedId);
    if (exact !== null) return exact;
  }

  for (const node of nodes) {
    const resolved = resolveScopedTreeSelection(node, normalizedId, selectableGraphNodeIds);
    if (resolved !== null) return resolved;
  }
  return null;
}

/*** Search one tree subtree in displayed order for a selection contained by the graph package scope. */
function resolveScopedTreeSelection(
  node: ProjectTreeNode,
  graphNodeId: string,
  selectableGraphNodeIds: readonly string[]
): ProjectTreeNode | null {
  const packageId = normalizeGraphPackage(node.graphPackage);
  if (isGraphDescendant(packageId, graphNodeId)) {
    const resolved = resolveProjectTreeSelection(node, selectableGraphNodeIds);
    if (
      resolved !== null &&
      isGraphDescendant(normalizeGraphPackage(resolved.graphPackage), graphNodeId)
    ) {
      return resolved;
    }
  }

  for (const child of node.children ?? []) {
    const resolved = resolveScopedTreeSelection(child, graphNodeId, selectableGraphNodeIds);
    if (resolved !== null) return resolved;
  }
  return null;
}

/*** Return whether a package is the selected graph scope or one of its dotted descendants. */
function isGraphDescendant(packageId: string, graphNodeId: string): boolean {
  return packageId === graphNodeId || packageId.startsWith(graphNodeId + '.');
}

/*** Normalize filesystem-style package separators to the graph identity representation. */
function normalizeGraphPackage(value: string): string {
  return value.replaceAll('/', '.').replace(/^\.+|\.+$/g, '');
}
