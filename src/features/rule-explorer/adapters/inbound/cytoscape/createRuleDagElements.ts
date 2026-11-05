import { toCytoscapeElements } from '@ankhorage/graph-cytoscape';

import type { RuleDagProjection } from '@/features/rule-explorer/domain/projectRuleDag';

/*** Adapts the canonical Rule DAG into Cytoscape elements for renderer-neutral graph consumers. */
export function createRuleDagElements(projection: RuleDagProjection) {
  return toCytoscapeElements(projection.graph, {
    nodeClasses: ({ data }) => [data.status?.toLowerCase() ?? 'not-executed', data.provenance],
  });
}
