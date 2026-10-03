import type { ProjectTreeNode } from '@/types/projectTree';

/*** Resolves the exact graph node represented by one visible project-tree row without descending. */
export function resolveProjectTreeGraphNodeId(
  node: ProjectTreeNode,
  graphNodeIds: readonly string[]
): string | null {
  if (node.kind === 'file') {
    const packageId = normalizeGraphPackage(node.graphPackage);
    return packageId !== '' && graphNodeIds.includes(packageId) ? packageId : null;
  }

  const directoryPath = readDirectoryPath(node.id);
  if (directoryPath === null) return null;

  return (
    graphNodeIds
      .filter(id => directoryPathEndsWithGraphId(directoryPath, id))
      .toSorted((left, right) => graphDepth(right) - graphDepth(left))
      .at(0) ?? null
  );
}

/*** Reads the stable filesystem path encoded in one directory tree id. */
function readDirectoryPath(id: string): string | null {
  const prefix = 'directory:';
  return id.startsWith(prefix) ? id.slice(prefix.length) : null;
}

/*** Matches a graph package to the trailing filesystem segments that represent that package. */
function directoryPathEndsWithGraphId(directoryPath: string, graphNodeId: string): boolean {
  const pathSegments = directoryPath.split('/').filter(Boolean);
  const graphSegments = normalizeGraphPackage(graphNodeId).split('.').filter(Boolean);
  if (graphSegments.length === 0 || graphSegments.length > pathSegments.length) return false;
  return graphSegments.every(
    (segment, index) => pathSegments[pathSegments.length - graphSegments.length + index] === segment
  );
}

/*** Counts graph-package segments for deterministic most-specific matching. */
function graphDepth(id: string): number {
  return normalizeGraphPackage(id).split('.').filter(Boolean).length;
}

/*** Normalizes filesystem-style package separators to graph identity representation. */
function normalizeGraphPackage(value: string): string {
  return value.replaceAll('/', '.').replace(/^\.+|\.+$/g, '');
}
