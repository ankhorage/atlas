import type { ElementsDefinition, NodeDefinition } from 'cytoscape';

import { filterByPackagePrefix } from '@/features/graph-view/utils/filterByPackagePrefix';
import { filterDependencyProjection } from '@/features/graph-view/utils/filterDependencyProjection';
import { filterEmptyPackages } from '@/features/graph-view/utils/filterEmptyPackages';
import { filterSubPackagesByDepth } from '@/features/graph-view/utils/filterSubPackagesByDepth';
import { filterVendorPackages } from '@/features/graph-view/utils/filterVendorPackages';
import { getMaxDepth } from '@/features/graph-view/utils/getMaxDepth';
import { groupScopedVendorPackages } from '@/features/graph-view/utils/groupScopedVendorPackages';
import { removeEmptyStructuralNodes } from '@/features/graph-view/utils/removeEmptyStructuralNodes';
import { revealCycleProjection } from '@/features/graph-view/utils/revealCycleProjection';
import { toggleCompoundNodes } from '@/features/graph-view/utils/toggleCompoundNodes';
import type { PackageCycleDetail } from '@/types/audit';
import type { DependencyFilterKind } from '@/types/settings';

/*** Projects the complete dependency graph into the explicitly selected package/depth/filter view. */
export function projectVisibleGraph(input: ProjectVisibleGraphInput): ProjectVisibleGraphResult {
  const dependencyFiltered = filterDependencyProjection(input.elements, {
    enabledKinds: input.enabledDependencyKinds ?? ALL_DEPENDENCY_KINDS,
    packagePrefix: input.dependencyPackagePrefix ?? '',
  });
  const compoundFiltered = toggleCompoundNodes(
    dependencyFiltered,
    input.showCompoundNodes,
    input.currentPackage
  );
  const packageFiltered = filterByPackagePrefix(
    compoundFiltered,
    input.currentPackage.replace(/\//g, '.')
  );
  const depthFiltered = filterSubPackagesByDepth(packageFiltered, true, input.subPackageDepth);
  const visible = input.showVendorPackages ? depthFiltered : filterVendorPackages(depthFiltered);
  const labeled = labelVisibleNodes(
    input.showCompoundNodes ? visible : removeEmptyStructuralNodes(visible),
    input.currentPackage
  );

  const projected =
    input.showCompoundNodes && input.showVendorPackages
      ? groupScopedVendorPackages(labeled)
      : labeled;
  return {
    elements: revealCycleProjection(input.elements, projected, input.revealedCycle),
    maxSubPackageDepth: Math.max(
      1,
      getMaxDepth(
        input.showVendorPackages ? packageFiltered : filterVendorPackages(packageFiltered)
      )
    ),
    redirectPackage: resolveRedirectPackage(input),
  };
}

interface ProjectVisibleGraphInput {
  readonly currentPackage: string;
  readonly dependencyPackagePrefix?: string;
  readonly elements: ElementsDefinition;
  readonly enabledDependencyKinds?: ReadonlySet<DependencyFilterKind>;
  readonly preservePackageScope?: boolean;
  readonly revealedCycle?: PackageCycleDetail;
  readonly showCompoundNodes: boolean;
  readonly showVendorPackages: boolean;
  readonly subPackageDepth: number;
}

const ALL_DEPENDENCY_KINDS = new Set<DependencyFilterKind>([
  'dependency',
  'devDependency',
  'peerDependency',
  'optionalDependency',
]);

interface ProjectVisibleGraphResult {
  readonly elements: ElementsDefinition;
  readonly maxSubPackageDepth: number;
  readonly redirectPackage: string | null;
}

/***
 * Calculates the first relevant branch only for Home/root navigation.
 * Explicit package scopes are stable, including empty/single-child structural nodes.
 * @performance
 * An active cycle can require the root scope as part of its projection. Redirecting while that
 * scope is preserved can cause an endless focus/redirect loop and repeatedly remount the renderer.
 */
function resolveRedirectPackage(input: ProjectVisibleGraphInput): string | null {
  const currentPackage = input.currentPackage.replaceAll('/', '.');
  if (input.preservePackageScope || currentPackage !== '') return null;

  if (hasMultipleRepositoryRoots(input.elements)) return null;

  const nextPackage = filterEmptyPackages('', input.elements);
  return nextPackage === '' ? null : nextPackage;
}

/*** Keep a disconnected multi-project overview at Home instead of picking an arbitrary repository. */
function hasMultipleRepositoryRoots(elements: ElementsDefinition): boolean {
  const roots = new Set(
    elements.nodes
      .filter(node => node.data.isIntrinsic === true)
      .filter(node => !node.data.parent)
      .map(node => String(node.data.id ?? ''))
      .filter(id => id.startsWith('repository.'))
      .filter(Boolean)
  );
  return roots.size > 1;
}

/*** Adds package-relative display labels without changing graph ids. */
function labelVisibleNodes(
  elements: ElementsDefinition,
  currentPackage: string
): ElementsDefinition {
  const normalizedPackage = currentPackage.replaceAll('/', '.');
  const visibleNodeIds = new Set(elements.nodes.map(node => String(node.data.id ?? '')));

  return {
    nodes: elements.nodes.map(node => ({
      group: 'nodes',
      classes: node.classes ?? '',
      data: {
        ...node.data,
        label: getVisibleNodeLabel(node, normalizedPackage, visibleNodeIds),
      },
    })),
    edges: elements.edges,
  };
}

/*** Resolves a node label from its visible compound context or the active package scope. */
function getVisibleNodeLabel(
  node: NodeDefinition,
  currentPackage: string,
  visibleNodeIds: ReadonlySet<string>
): string {
  const id = String(node.data.id ?? '');
  const parent = typeof node.data.parent === 'string' ? node.data.parent : '';
  const repositoryLabel =
    currentPackage === '' &&
    parent === '' &&
    typeof node.data.repositoryId === 'string' &&
    typeof node.data.label === 'string'
      ? node.data.label
      : undefined;

  return (
    repositoryLabel ??
    (parent && visibleNodeIds.has(parent) && id.startsWith(`${parent}.`)
      ? id.slice(parent.length + 1)
      : getRelativeNodeLabel(id, currentPackage))
  );
}

/*** Resolves a readable label for the active package itself and for its descendants. */
function getRelativeNodeLabel(id: string, currentPackage: string): string {
  if (!currentPackage) return id;
  if (id === currentPackage) return id.split('.').at(-1) ?? id;
  const descendantPrefix = currentPackage + '.';
  return id.startsWith(descendantPrefix) ? id.slice(descendantPrefix.length) : id;
}
