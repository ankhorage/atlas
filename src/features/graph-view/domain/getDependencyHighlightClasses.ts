import type { GraphEdge } from '@ankhorage/graph';

/***
 * Assigns Atlas highlight/hushed presentation to direct incoming and outgoing dependencies.
 * @performance Classify edges once per interaction, with set membership instead of per-node scans.
 * This is product presentation policy; generic graph traversal remains owned by @ankhorage/graph.
 */
export function getDependencyHighlightClasses(
  nodeIds: readonly string[],
  edges: readonly Pick<GraphEdge, 'source' | 'target'>[],
  activeNodeIds: ReadonlySet<string>,
  parentById: ReadonlyMap<string, string>
) {
  const visibleActiveNodeIds = getVisibleActiveNodeIds(activeNodeIds, parentById);
  const compoundDescendantNodeIds = new Set(
    [...visibleActiveNodeIds].filter(id => !activeNodeIds.has(id))
  );
  const outgoing = new Set<string>();
  const incoming = new Set<string>();
  const edgeClasses = edges.map(edge => {
    const fromActive = visibleActiveNodeIds.has(edge.source);
    const toActive = visibleActiveNodeIds.has(edge.target);
    const internalCompoundEdge =
      fromActive &&
      toActive &&
      (compoundDescendantNodeIds.has(edge.source) || compoundDescendantNodeIds.has(edge.target));
    if (fromActive && !internalCompoundEdge) outgoing.add(edge.target);
    if (toActive && !internalCompoundEdge) incoming.add(edge.source);
    return internalCompoundEdge
      ? 'highlight'
      : getClasses(false, fromActive, toActive, activeNodeIds.size > 0);
  });
  const nodeClasses = nodeIds.map(id =>
    getClasses(
      visibleActiveNodeIds.has(id),
      outgoing.has(id),
      incoming.has(id),
      activeNodeIds.size > 0
    )
  );
  return { nodeClasses, edgeClasses };
}

/*** Expands selected visible compounds through their logical child relation without changing selection. */
function getVisibleActiveNodeIds(
  activeNodeIds: ReadonlySet<string>,
  parentById: ReadonlyMap<string, string>
): ReadonlySet<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const [childId, parentId] of parentById) {
    const children = childrenByParent.get(parentId) ?? [];
    children.push(childId);
    childrenByParent.set(parentId, children);
  }

  const visibleActiveNodeIds = new Set(activeNodeIds);
  const pendingParentIds = [...activeNodeIds];
  for (const parentId of pendingParentIds) {
    for (const childId of childrenByParent.get(parentId) ?? []) {
      if (visibleActiveNodeIds.has(childId)) continue;
      visibleActiveNodeIds.add(childId);
      pendingParentIds.push(childId);
    }
  }
  return visibleActiveNodeIds;
}

/*** Keeps dependency direction and active-node emphasis while dimming unrelated elements. */
function getClasses(active: boolean, outgoing: boolean, incoming: boolean, hasFocus: boolean) {
  if (!hasFocus) return '';
  if (!active && !outgoing && !incoming) return 'hushed';
  return [
    active ? 'highlight' : '',
    outgoing ? 'highlight-outgoer' : '',
    incoming ? 'highlight-incomer' : '',
  ]
    .filter(Boolean)
    .join(' ');
}
