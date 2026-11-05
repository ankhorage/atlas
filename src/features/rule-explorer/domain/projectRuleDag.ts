import type { Graph } from '@ankhorage/graph';
import type {
  RuleEvaluationPlanFacet,
  RuleEvaluationPlanNode,
  RuleEvaluationResult,
  RuleExecutionProvenance,
  RuleIdentity,
  RuleResultStatus,
  RuleScope,
} from '@ankhorage/rules';

export type RuleDagView = 'dependencies' | 'execution';

export interface RuleDagNodeData extends Readonly<Record<string, unknown>> {
  readonly facets: readonly RuleEvaluationPlanFacet[];
  readonly label: string;
  readonly provenance: RuleExecutionProvenance;
  readonly ruleId: string;
  readonly scope: string;
  readonly status: RuleResultStatus | null;
}

interface RuleDagEdgeData extends Readonly<Record<string, unknown>> {
  readonly dependencyRuleId: string;
}

export interface RuleDagProjection {
  readonly graph: Graph<RuleDagNodeData, RuleDagEdgeData>;
  readonly availableFacets: readonly RuleEvaluationPlanFacet[];
}

export interface RuleFacetFilter {
  readonly id: string;
  readonly values: readonly string[];
}

/*** Projects the evaluator-owned scoped rule plan into a stable dependency DAG. */
export function projectRuleDag(
  evaluation: RuleEvaluationResult,
  facetFilters: readonly RuleFacetFilter[] = []
): RuleDagProjection {
  const visibleNodes = evaluation.plan.nodes.filter(node =>
    matchesFacetFilters(node.facets, facetFilters)
  );
  const visibleNodeIds = new Set(visibleNodes.map(node => node.id));
  const resultsByScopedRule = new Map(
    evaluation.results.map(result => [ruleEvaluationIdentity(result.rule, result.scope), result])
  );
  const nodeIdsByScopedRuleId = groupNodeIdsByScopedRuleId(visibleNodes);

  return {
    availableFacets: uniqueFacets(evaluation.plan.nodes.flatMap(node => node.facets)),
    graph: {
      nodes: visibleNodes.map(node => {
        const result = resultsByScopedRule.get(ruleEvaluationIdentity(node.rule, node.scope));
        return {
          id: node.id,
          data: {
            facets: node.facets,
            label: `${node.rule.id}@${node.rule.version} (${node.scope.kind}: ${node.scope.id})`,
            provenance: result?.execution ?? 'unknown',
            ruleId: node.rule.id,
            scope: node.scope.id,
            status: result?.status ?? null,
          },
        };
      }),
      edges: visibleNodes.flatMap(node =>
        node.dependencyRuleIds.flatMap(dependencyRuleId =>
          (nodeIdsByScopedRuleId.get(scopedRuleId(dependencyRuleId, node.scope)) ?? [])
            .filter(dependencyId => visibleNodeIds.has(dependencyId))
            .map(dependencyId => ({
              id: `${node.id}->${dependencyId}`,
              source: node.id,
              target: dependencyId,
              data: { dependencyRuleId },
            }))
        )
      ),
    },
  };
}

/*** Returns the status label without fabricating a result for a plan-only rule instance. */
export function formatRuleDagStatus(status: RuleResultStatus | null): string {
  return status ?? 'NOT EXECUTED';
}

/*** Keeps a node when every actively controlled facet category matches its provider-owned value. */
function matchesFacetFilters(
  facets: readonly RuleEvaluationPlanFacet[],
  facetFilters: readonly RuleFacetFilter[]
): boolean {
  return facetFilters.every(
    ({ id, values }) =>
      values.length === 0 || facets.some(facet => facet.id === id && values.includes(facet.value))
  );
}

/*** Forms the evaluator's exact rule-and-scope identity without treating a plain rule ID as scoped. */
function ruleEvaluationIdentity(rule: RuleIdentity, scope: RuleScope): string {
  return `${rule.id}\u0000${rule.version}\u0000${scope.kind}\u0000${scope.id}`;
}

/*** Forms the evaluator's scope-aware dependency lookup key without inventing a node identity. */
function scopedRuleId(ruleId: string, scope: RuleScope): string {
  return `${ruleId}\u0000${scope.kind}\u0000${scope.id}`;
}

/*** Indexes visible nodes by the dependency identity the evaluator can resolve within one scope. */
function groupNodeIdsByScopedRuleId(
  nodes: readonly RuleEvaluationPlanNode[]
): ReadonlyMap<string, readonly string[]> {
  return nodes.reduce(
    (nodeIdsByScopedRuleId, node) =>
      new Map(nodeIdsByScopedRuleId).set(scopedRuleId(node.rule.id, node.scope), [
        ...(nodeIdsByScopedRuleId.get(scopedRuleId(node.rule.id, node.scope)) ?? []),
        node.id,
      ]),
    new Map<string, readonly string[]>()
  );
}

/*** Deduplicates provider-owned facet descriptors while retaining their declared versions. */
function uniqueFacets(
  facets: readonly RuleEvaluationPlanFacet[]
): readonly RuleEvaluationPlanFacet[] {
  return [
    ...new Map(
      facets.map(facet => [`${facet.id}\u0000${facet.value}\u0000${facet.version}`, facet])
    ).values(),
  ];
}
