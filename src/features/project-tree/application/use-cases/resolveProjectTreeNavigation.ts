import { resolveProjectTreeGraphNodeId } from '@/features/project-tree/utils/resolveProjectTreeGraphNodeId';
import type { ProjectTreeNode } from '@/types/projectTree';

/*** Resolves folder navigation to the exact represented graph scope without descending. */
export function resolveProjectTreeNavigation(
  node: ProjectTreeNode,
  graphNodeIds: readonly string[],
  currentPackage: string
): string {
  return resolveProjectTreeGraphNodeId(node, graphNodeIds) ?? currentPackage;
}
