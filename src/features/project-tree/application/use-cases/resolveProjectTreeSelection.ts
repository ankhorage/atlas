import { resolveProjectTreeGraphNodeId } from '@/features/project-tree/utils/resolveProjectTreeGraphNodeId';
import type { ProjectTreeNode } from '@/types/projectTree';

/*** Resolves one TreeView row only when that exact visible row represents a graph node. */
export function resolveProjectTreeSelection(
  node: ProjectTreeNode,
  graphNodeIds: readonly string[]
): ProjectTreeNode | null {
  return resolveProjectTreeGraphNodeId(node, graphNodeIds) === null ? null : node;
}
