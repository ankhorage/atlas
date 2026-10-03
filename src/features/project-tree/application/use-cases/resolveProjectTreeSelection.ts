import { findProjectTreeNodeByGraphPackage } from '@/features/project-tree/utils/findProjectTreeNodeByGraphPackage';
import type { ProjectTreeNode } from '@/types/projectTree';

/***
 * Resolves one TreeView row to the first graph-selectable descendant in displayed tree order.
 * Repeated filesystem containers representing the same package collapse to the deepest directory.
 */
export function resolveProjectTreeSelection(
  node: ProjectTreeNode,
  selectableGraphNodeIds: readonly string[]
): ProjectTreeNode | null {
  const selectable = new Set(selectableGraphNodeIds);
  return resolveNodeSelection(node, selectable);
}

/*** Resolve one subtree without reordering its already-sorted TreeView children. */
function resolveNodeSelection(
  node: ProjectTreeNode,
  selectable: ReadonlySet<string>
): ProjectTreeNode | null {
  const packageId = normalizeGraphPackage(node.graphPackage);
  if (packageId && selectable.has(packageId)) {
    return findProjectTreeNodeByGraphPackage([node], node.graphPackage) ?? node;
  }

  for (const child of node.children ?? []) {
    const resolved = resolveNodeSelection(child, selectable);
    if (resolved !== null) return resolved;
  }
  return null;
}

/*** Normalize filesystem-style package separators to the graph identity representation. */
function normalizeGraphPackage(value: string): string {
  return value.replaceAll('/', '.').replace(/^\.+|\.+$/g, '');
}
