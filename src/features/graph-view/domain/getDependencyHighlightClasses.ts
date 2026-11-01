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
  const childrenByParent = getChildrenByParent(parentById);
  const visibleActiveNodeIds = getVisibleActiveNodeIds(activeNodeIds, childrenByParent);
  const selectedCompoundScopes = getSelectedCompoundScopes(
    activeNodeIds,
    childrenByParent,
    visibleActiveNodeIds
  );
  const outgoing = new Set<string>();
  const incoming = new Set<string>();
  const edgeClasses = edges.map(edge => {
    const fromActive = visibleActiveNodeIds.has(edge.source);
    const toActive = visibleActiveNodeIds.has(edge.target);
    const internalCompoundEdge = hasSharedSelectedCompoundScope(
      edge.source,
      edge.target,
      selectedCompoundScopes
    );
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

/*** Indexes direct visible children so selection expansion and scope classification share one ancestry relation. */
function getChildrenByParent(
  parentById: ReadonlyMap<string, string>
): ReadonlyMap<string, string[]> {
  const childrenByParent = new Map<string, string[]>();
  for (const [childId, parentId] of parentById) {
    const children = childrenByParent.get(parentId) ?? [];
    children.push(childId);
    childrenByParent.set(parentId, children);
  }
  return childrenByParent;
}

/*** Expands selected visible compounds through their logical child relation without changing selection. */
function getVisibleActiveNodeIds(
  activeNodeIds: ReadonlySet<string>,
  childrenByParent: ReadonlyMap<string, readonly string[]>
): ReadonlySet<string> {
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

/*** Assigns each expanded node to selected compounds that actually contain descendants. */
function getSelectedCompoundScopes(
  activeNodeIds: ReadonlySet<string>,
  childrenByParent: ReadonlyMap<string, readonly string[]>,
  visibleActiveNodeIds: ReadonlySet<string>
): ReadonlyMap<string, ReadonlySet<string>> {
  const scopesByNodeId = new Map<string, Set<string>>();
  for (const compoundId of activeNodeIds) {
    if (!childrenByParent.has(compoundId)) continue;
    for (const nodeId of getVisibleCompoundNodeIds(compoundId, childrenByParent)) {
      if (!visibleActiveNodeIds.has(nodeId)) continue;
      const scopes = scopesByNodeId.get(nodeId) ?? new Set<string>();
      scopes.add(compoundId);
      scopesByNodeId.set(nodeId, scopes);
    }
  }
  return scopesByNodeId;
}

/*** Expands one compound scope inclusively through its visible child relation. */
function getVisibleCompoundNodeIds(
  compoundId: string,
  childrenByParent: ReadonlyMap<string, readonly string[]>
): ReadonlySet<string> {
  const nodeIds = new Set([compoundId]);
  const pendingNodeIds = [compoundId];
  for (const nodeId of pendingNodeIds) {
    for (const childId of childrenByParent.get(nodeId) ?? []) {
      if (nodeIds.has(childId)) continue;
      nodeIds.add(childId);
      pendingNodeIds.push(childId);
    }
  }
  return nodeIds;
}

/*** Returns whether both dependency endpoints belong to one selected compound scope. */
function hasSharedSelectedCompoundScope(
  sourceId: string,
  targetId: string,
  scopesByNodeId: ReadonlyMap<string, ReadonlySet<string>>
): boolean {
  const sourceScopes = scopesByNodeId.get(sourceId);
  const targetScopes = scopesByNodeId.get(targetId);
  if (sourceScopes === undefined || targetScopes === undefined) return false;
  return [...sourceScopes].some(scopeId => targetScopes.has(scopeId));
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
