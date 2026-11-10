import { toCytoscapeElements } from '@ankhorage/graph-cytoscape';

import type { PackageDependencyGraph } from '@/types/dependencyAnalysis';

/*** Converts projected package facts into Cytoscape classes without reclassifying owner data. */
export function createPackageGraphElements(packageGraph: PackageDependencyGraph) {
  return toCytoscapeElements(packageGraph, {
    nodeClasses: node =>
      [
        node.data.isIntrinsic === true ? undefined : 'isVendor',
        node.data.isWorkspaceRoot === true ? 'isWorkspaceRoot' : undefined,
        repositoryColorClass(node.data.isIntrinsic === true ? node.data.repositoryId : undefined),
      ].filter((value): value is string => value !== undefined),
  });
}

/***
 * Maps an immutable repository identity onto a stable ZORA palette slot.
 *
 * Hashing each ID independently keeps existing repositories visually stable when sources are
 * reordered, filtered, retried, or added. Seven semantic roles make collisions uncommon in the
 * intended multi-project workspace size; a collision remains legible through the repository root
 * label instead of causing unrelated repositories to reshuffle.
 */
function repositoryColorClass(repositoryId: string | undefined): string | undefined {
  if (repositoryId === undefined) return undefined;
  return `repositoryColor${hashRepositoryId(repositoryId) % 7}`;
}

/*** Produces one deterministic unsigned hash without deriving identity from a display label. */
function hashRepositoryId(repositoryId: string): number {
  let hash = 2_166_136_261;
  for (const character of repositoryId) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}
