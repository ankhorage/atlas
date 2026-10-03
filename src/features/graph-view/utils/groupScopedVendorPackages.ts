import type { ElementsDefinition, NodeDefinition } from 'cytoscape';

const VENDOR_SCOPE_NODE_PREFIX = 'vendor-scope:';

/***
 * Groups visible canonical scoped vendor roots under presentation-only organization compounds.
 * @performance Index scoped vendors once and only materialize compounds for scopes with siblings.
 */
export function groupScopedVendorPackages(elements: ElementsDefinition): ElementsDefinition {
  const packagesByScope = indexScopedVendorPackages(elements.nodes);
  const groupedScopes = new Map([...packagesByScope].filter(([, packages]) => packages.length > 1));
  if (groupedScopes.size === 0) return elements;

  return {
    nodes: [
      ...elements.nodes.map(node => groupScopedVendorNode(node, groupedScopes)),
      ...[...groupedScopes.keys()].map(createVendorScopeNode),
    ],
    edges: elements.edges,
  };
}

interface ScopedVendorPackage {
  readonly packageName: string;
  readonly scope: string;
}

/*** Indexes exact canonical vendor roots while ignoring unknown references and vendor subpaths. */
function indexScopedVendorPackages(
  nodes: readonly NodeDefinition[]
): ReadonlyMap<string, readonly ScopedVendorPackage[]> {
  const packagesByScope = new Map<string, ScopedVendorPackage[]>();

  for (const node of nodes) {
    const scopedPackage = readScopedVendorPackage(node);
    if (scopedPackage === null) continue;
    const packages = packagesByScope.get(scopedPackage.scope) ?? [];
    packages.push(scopedPackage);
    packagesByScope.set(scopedPackage.scope, packages);
  }

  return packagesByScope;
}

/*** Adds presentation parent metadata only when a visible scoped vendor has sibling packages. */
function groupScopedVendorNode(
  node: NodeDefinition,
  groupedScopes: ReadonlyMap<string, readonly ScopedVendorPackage[]>
): NodeDefinition {
  const scopedPackage = readScopedVendorPackage(node);
  if (scopedPackage === null || !groupedScopes.has(scopedPackage.scope)) return node;

  return {
    ...node,
    data: {
      ...node.data,
      label: scopedPackage.packageName,
      name: scopedPackage.packageName,
      parent: vendorScopeNodeId(scopedPackage.scope),
    },
  };
}

/*** Reads one canonical npm scoped package root without inferring identity from vendor subpaths. */
function readScopedVendorPackage(node: NodeDefinition): ScopedVendorPackage | null {
  if (node.data.classification !== 'vendor') return null;
  const id = typeof node.data.id === 'string' ? node.data.id : '';
  const match = /^(@[^/]+)\/([^/]+)$/.exec(id);
  if (match === null) return null;

  return {
    scope: match[1],
    packageName: match[2],
  };
}

/*** Creates the presentation-only organization node used by Cytoscape compound projection. */
function createVendorScopeNode(scope: string): NodeDefinition {
  return {
    group: 'nodes',
    classes: 'isVendor',
    data: {
      id: vendorScopeNodeId(scope),
      classification: 'vendor',
      isIntrinsic: false,
      label: scope,
      name: scope,
      vendorScope: scope,
    },
  };
}

/*** Names synthetic scope nodes outside the canonical package-id namespace. */
function vendorScopeNodeId(scope: string): string {
  return `${VENDOR_SCOPE_NODE_PREFIX}${scope}`;
}
