import type { ElementsDefinition, NodeDefinition } from 'cytoscape';

import { filterByPackagePrefix } from '@/features/graph-view/utils/filterByPackagePrefix';
import { filterEmptyPackages } from '@/features/graph-view/utils/filterEmptyPackages';
import { filterSubPackagesByDepth } from '@/features/graph-view/utils/filterSubPackagesByDepth';
import { filterVendorPackages } from '@/features/graph-view/utils/filterVendorPackages';
import { getMaxDepth } from '@/features/graph-view/utils/getMaxDepth';
import { groupScopedVendorPackages } from '@/features/graph-view/utils/groupScopedVendorPackages';
import { removeEmptyStructuralNodes } from '@/features/graph-view/utils/removeEmptyStructuralNodes';
import { toggleCompoundNodes } from '@/features/graph-view/utils/toggleCompoundNodes';

/*** Projects the complete dependency graph into the explicitly selected package/depth/filter view. */
export function projectVisibleGraph(input: ProjectVisibleGraphInput): ProjectVisibleGraphResult {
  const compoundFiltered = toggleCompoundNodes(
    input.elements,
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

  return {
    elements:
      input.showCompoundNodes && input.showVendorPackages
        ? groupScopedVendorPackages(labeled)
        : labeled,
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
  readonly elements: ElementsDefinition;
  readonly preservePackageScope?: boolean;
  readonly showCompoundNodes: boolean;
  readonly showVendorPackages: boolean;
  readonly subPackageDepth: number;
}

interface ProjectVisibleGraphResult {
  readonly elements: ElementsDefinition;
  readonly maxSubPackageDepth: number;
  readonly redirectPackage: string | null;
}

/***
 * Calculates the first relevant branch only for Home/root navigation.
 * Explicit package scopes are stable, including empty/single-child structural nodes.
 * Performance:
 * An active cycle can require the root scope as part of its projection. Redirecting while that
 * scope is preserved can cause an endless focus/redirect loop and repeatedly remount the renderer.
 */
function resolveRedirectPackage(input: ProjectVisibleGraphInput): string | null {
  const currentPackage = input.currentPackage.replaceAll('/', '.');
  if (input.preservePackageScope || currentPackage !== '') return null;

  const nextPackage = filterEmptyPackages('', input.elements);
  return nextPackage === '' ? null : nextPackage;
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

  return parent && visibleNodeIds.has(parent) && id.startsWith(`${parent}.`)
    ? id.slice(parent.length + 1)
    : getRelativeNodeLabel(id, currentPackage);
}

/*** Resolves a readable label for the active package itself and for its descendants. */
function getRelativeNodeLabel(id: string, currentPackage: string): string {
  if (!currentPackage) return id;
  if (id === currentPackage) return id.split('.').at(-1) ?? id;
  const descendantPrefix = currentPackage + '.';
  return id.startsWith(descendantPrefix) ? id.slice(descendantPrefix.length) : id;
}
