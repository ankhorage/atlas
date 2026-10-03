import type { ElementsDefinition } from 'cytoscape';

import { isIntrinsicGraphNode } from '@/features/graph-view/utils/isIntrinsicGraphNode';

/***
 * Skips a unique chain of structural project packages, stopping before real dependency endpoints.
 * @performance Use full-graph indexes: navigation must not depend on depth projection or vendors.
 * Preserve real isolated leaves and branching packages rather than silently filtering them away.
 */
export function filterEmptyPackages(currentPackage: string, elements: ElementsDefinition): string {
  const children = new Map<string, string[]>();
  for (const node of elements.nodes.filter(isIntrinsicGraphNode)) {
    const id = String(node.data.id ?? '');
    if (!id) continue;
    const boundary = id.lastIndexOf('.');
    const parent = boundary < 0 ? '' : id.slice(0, boundary);
    const siblings = children.get(parent) ?? [];
    siblings.push(id);
    children.set(parent, siblings);
  }
  const connected = new Set(elements.edges.flatMap(edge => [edge.data.source, edge.data.target]));
  return descend(currentPackage, children, connected);
}

/*** Descends only when the next package is a relationship-free structural container. */
function descend(
  scope: string,
  children: ReadonlyMap<string, readonly string[]>,
  connected: ReadonlySet<string>
): string {
  const candidates = children.get(scope) ?? [];
  const [next] = candidates;
  if (candidates.length !== 1 || !next || connected.has(next) || !children.has(next)) return scope;
  return descend(next, children, connected);
}
