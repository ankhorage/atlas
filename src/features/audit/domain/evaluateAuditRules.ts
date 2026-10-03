import type { SourceGraph } from '@ankhorage/dependency-graph';
import { evaluateRules, type RuleEvaluationResult } from '@ankhorage/rules';
import { createArchitectureGraphRuleSet } from '@ankhorage/rules-architecture';

import type {
  AuditRuleConfiguration,
  AuditRuleResult,
  CyclicDependenciesEvidence,
  EvaluateAuditRulesInput,
  EvaluateAuditRulesResult,
  PackageCycleDetail,
} from '@/types/audit';

/*** Evaluate enabled Atlas audit rules through the canonical generic Rules provider. */
export function evaluateAuditRules(input: EvaluateAuditRulesInput): EvaluateAuditRulesResult {
  const mode = findRuleMode(input.configuration.rules, 'cyclic-dependencies');
  if (mode === 'off') return { genericRules: emptyRuleEvaluation(), rules: [] };

  const ruleSet = createArchitectureGraphRuleSet();
  const genericRules = evaluateRules({ graph: input.sourceGraph }, ruleSet.rules, {
    capabilities: sourceRuleCapabilities(input.sourceGraph),
    optionsByRuleId: new Map([['cyclic-dependencies', { aggregation: 'package' }]]),
  });

  return {
    genericRules,
    rules: [presentCyclicDependencies(input.cyclicPackages, mode, genericRules)],
  };
}

/*** Adapt canonical cycle findings into the existing Atlas audit presentation contract. */
function presentCyclicDependencies(
  cycles: readonly PackageCycleDetail[],
  mode: Exclude<AuditRuleConfiguration['mode'], 'off'>,
  genericRules: RuleEvaluationResult
): AuditRuleResult<CyclicDependenciesEvidence> {
  const findings = genericRules.findings.filter(({ ruleId }) => ruleId === 'cyclic-dependencies');
  const failed = findings.length > 0;
  return {
    id: 'cyclic-dependencies',
    status: failed ? 'failed' : 'passed',
    policy: mode === 'block' ? 'blocking' : 'advisory',
    message: failed
      ? `Detected ${findings.length} cyclic package dependenc${findings.length === 1 ? 'y' : 'ies'}.`
      : 'No cyclic package dependencies detected.',
    details: cycles.map(cycle => cycle.packages.join(' → ')),
    evidence: { cycles },
  };
}

/*** Expose SourceGraph capabilities using the identifiers required by Architecture Rules. */
function sourceRuleCapabilities(graph: SourceGraph): readonly string[] {
  const projectIds = new Set(graph.capabilities.map(({ projectId }) => projectId));
  if (projectIds.size === 0) return [];
  const importsAvailable = [...projectIds].every(projectId =>
    graph.capabilities.some(
      report => report.projectId === projectId && report.available.includes('imports')
    )
  );
  return importsAvailable ? ['source-graph.imports'] : [];
}

/*** Create an empty canonical generic Rules result for explicitly disabled audit rules. */
function emptyRuleEvaluation(): RuleEvaluationResult {
  return { diagnostics: [], findings: [] };
}

/*** Return the effective mode for one known Atlas audit rule. */
function findRuleMode(
  rules: readonly AuditRuleConfiguration[],
  id: AuditRuleConfiguration['id']
): AuditRuleConfiguration['mode'] {
  return rules.find(rule => rule.id === id)?.mode ?? 'off';
}
