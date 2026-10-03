import { serializeSourceGraph } from '@ankhorage/dependency-graph';
import type { RuleEvaluationResult } from '@ankhorage/rules';
import { detectArchitecture } from '@ankhorage/rules-architecture';

import { getPackageCyclesWithMembers } from '@/features/audit/application/use-cases/getPackageCyclesWithMembers';
import { evaluateArchitectureTarget } from '@/features/audit/domain/evaluateArchitectureTarget';
import { evaluateAuditRules } from '@/features/audit/domain/evaluateAuditRules';
import { resolveAuditConfiguration } from '@/features/audit/domain/resolveAuditConfiguration';
import type {
  Audit,
  AuditArchitectureEvaluation,
  ResolveAuditConfigurationInput,
} from '@/types/audit';
import type { ProjectSnapshot } from '@/types/projectAnalysis';
import { getProjectName } from '@/utils/getProjectName';

/*** Evaluate provider-backed rules and architecture against the same retained canonical SourceGraph. */
export function createAuditFromSnapshot(
  snapshot: ProjectSnapshot,
  configurationInput: ResolveAuditConfigurationInput = {},
): Audit {
  const configuration = resolveAuditConfiguration(configurationInput);
  const cyclicPackages = getPackageCyclesWithMembers(snapshot.files, snapshot.packageGraph).cycles;
  const ruleEvaluation = evaluateAuditRules({
    configuration,
    cyclicPackages,
    sourceGraph: snapshot.sourceGraph,
  });
  const architecture = detectArchitecture(snapshot.sourceGraph);
  const architectureEvaluation = evaluateArchitectureTarget(
    snapshot.sourceGraph,
    configuration.architectureTarget,
  );

  return {
    configuration,
    evaluation: {
      architecture,
      ...(architectureEvaluation === undefined ? {} : { architectureEvaluation }),
      cyclicPackages,
      genericRules: mergeRuleEvaluation(ruleEvaluation.genericRules, architectureEvaluation),
      rules: ruleEvaluation.rules,
    },
    files: snapshot.files,
    packageGraph: snapshot.packageGraph,
    sourceGraph: serializeSourceGraph(snapshot.sourceGraph),
    meta: {
      language: snapshot.language,
      projectName: getProjectName(snapshot.projectPath),
      timeStart: snapshot.timeStart,
      timeEnd: Date.now(),
    },
  };
}

/*** Merge target-independent and explicitly targeted generic findings into one Audit view. */
function mergeRuleEvaluation(
  base: RuleEvaluationResult,
  architecture: AuditArchitectureEvaluation | undefined,
): RuleEvaluationResult {
  if (architecture === undefined) return base;
  return {
    diagnostics: [...base.diagnostics, ...architecture.result.diagnostics],
    findings: [...base.findings, ...architecture.result.findings],
  };
}
