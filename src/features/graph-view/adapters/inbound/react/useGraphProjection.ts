'use client';
import type { ElementsDefinition } from 'cytoscape';
import { useEffect, useMemo } from 'react';

import { projectVisibleGraph } from '@/features/graph-view/utils/projectVisibleGraph';
import type { PackageCycleDetail } from '@/types/audit';
import type { DependencyFilterKind } from '@/types/settings';

/***
 * Projects graph inputs without changing the explicitly selected package scope.
 * @performance
 * Package/depth/vendor projection traverses nodes and aggregates edges. Keep it memoized on its
 * actual inputs so unrelated UI renders do not repeat that work or replace the visible graph data.
 * Preserve lifted-edge weights and explicit cycle scopes when optimizing; projectVisibleGraph tests
 * cover those behaviors. Do not add a second independently maintained projection state.
 */
export function useGraphProjection(input: UseGraphProjectionInput): ElementsDefinition | null {
  const {
    currentPackage,
    dependencyPackagePrefix,
    elements,
    enabledDependencyKinds,
    preservePackageScope,
    revealedCycle,
    showCompoundNodes,
    showVendorPackages,
    subPackageDepth,
  } = input;
  const projection = useMemo(
    () =>
      elements === null
        ? null
        : createProjection(
            currentPackage,
            dependencyPackagePrefix,
            elements,
            enabledDependencyKinds,
            preservePackageScope,
            revealedCycle,
            showCompoundNodes,
            showVendorPackages,
            subPackageDepth
          ),
    [
      currentPackage,
      dependencyPackagePrefix,
      elements,
      enabledDependencyKinds,
      preservePackageScope,
      revealedCycle,
      showCompoundNodes,
      showVendorPackages,
      subPackageDepth,
    ]
  );
  useProjectionLifecycle(projection, input);

  return projection?.redirectPackage === null ? projection.elements : null;
}

/*** Synchronize projection-derived bounds and redirects after its pure calculation completes. */
function useProjectionLifecycle(
  projection: ReturnType<typeof projectVisibleGraph> | null,
  input: ProjectionLifecycleInput
) {
  const { setCurrentPackage, setMaxSubPackageDepth, setSubPackageDepth, subPackageDepth } = input;
  useEffect(() => {
    if (projection === null) return;
    setMaxSubPackageDepth(projection.maxSubPackageDepth);
    if (projection.redirectPackage === null && subPackageDepth > projection.maxSubPackageDepth) {
      setSubPackageDepth(projection.maxSubPackageDepth);
    }
    if (projection.redirectPackage !== null) setCurrentPackage(projection.redirectPackage);
  }, [projection, setCurrentPackage, setMaxSubPackageDepth, setSubPackageDepth, subPackageDepth]);
}

/*** Adapt hook inputs to the pure projection boundary without creating separate projection state. */
function createProjection(
  currentPackage: string,
  dependencyPackagePrefix: string | undefined,
  elements: ElementsDefinition,
  enabledDependencyKinds: ReadonlySet<DependencyFilterKind> | undefined,
  preservePackageScope: boolean | undefined,
  revealedCycle: PackageCycleDetail | undefined,
  showCompoundNodes: boolean,
  showVendorPackages: boolean,
  subPackageDepth: number
) {
  return projectVisibleGraph({
    currentPackage,
    dependencyPackagePrefix,
    elements,
    enabledDependencyKinds,
    preservePackageScope,
    revealedCycle,
    showCompoundNodes,
    showVendorPackages,
    subPackageDepth,
  });
}

interface UseGraphProjectionInput {
  readonly currentPackage: string;
  readonly dependencyPackagePrefix?: string;
  readonly elements: ElementsDefinition | null;
  readonly enabledDependencyKinds?: ReadonlySet<DependencyFilterKind>;
  readonly preservePackageScope?: boolean;
  readonly revealedCycle?: PackageCycleDetail;
  readonly setCurrentPackage: (path: string) => void;
  readonly setMaxSubPackageDepth: (depth: number) => void;
  readonly setSubPackageDepth: (depth: number) => void;
  readonly showCompoundNodes: boolean;
  readonly showVendorPackages: boolean;
  readonly subPackageDepth: number;
}

interface ProjectionLifecycleInput {
  readonly setCurrentPackage: (path: string) => void;
  readonly setMaxSubPackageDepth: (depth: number) => void;
  readonly setSubPackageDepth: (depth: number) => void;
  readonly subPackageDepth: number;
}
