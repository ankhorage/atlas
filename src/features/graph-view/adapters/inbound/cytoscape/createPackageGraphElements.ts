import { toCytoscapeElements } from '@ankhorage/graph-cytoscape';

import type { PackageDependencyGraph } from '@/types/dependencyAnalysis';

/*** Converts projected package facts into Cytoscape classes without reclassifying owner data. */
export function createPackageGraphElements(packageGraph: PackageDependencyGraph) {
  return toCytoscapeElements(packageGraph, {
    nodeClasses: node =>
      [
        node.data.isIntrinsic === true ? undefined : 'isVendor',
        node.data.isWorkspaceRoot === true ? 'isWorkspaceRoot' : undefined,
      ].filter((value): value is string => value !== undefined),
  });
}
