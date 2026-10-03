import type { GraphEdge } from '@ankhorage/graph';

/***
 * Assigns PKGViz highlight/hushed presentation to direct incoming and outgoing dependencies.
 * @performance Classify edges once per interaction, with set membership instead of per-node scans.
 * This is product presentation policy; generic graph traversal remains owned by @ankhorage/graph.
 */
export function getDependencyHighlightClasses(
  nodeIds: readonly string[],
  edges: readonly Pick<GraphEdge, 'source' | 'target'>[],
  activeNodeIds: ReadonlySet<string>
) {
  const outgoing = new Set<string>();
  const incoming = new Set<string>();
  const edgeClasses = edges.map(edge => {
    const fromActive = activeNodeIds.has(edge.source);
    const toActive = activeNodeIds.has(edge.target);
    if (fromActive) outgoing.add(edge.target);
    if (toActive) incoming.add(edge.source);
    return getClasses(false, fromActive, toActive, activeNodeIds.size > 0);
  });
  const nodeClasses = nodeIds.map(id =>
    getClasses(activeNodeIds.has(id), outgoing.has(id), incoming.has(id), activeNodeIds.size > 0)
  );
  return { nodeClasses, edgeClasses };
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
