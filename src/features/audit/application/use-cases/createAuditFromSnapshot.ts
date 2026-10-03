import { serializeSourceGraph } from '@ankhorage/dependency-graph';
import { detectArchitecture } from '@ankhorage/rules-architecture';

import { getPackageCyclesWithMembers } from '@/features/audit/application/use-cases/getPackageCyclesWithMembers';
import { evaluateAuditRules } from '@/features/audit/domain/evaluateAuditRules';
import { resolveAuditConfiguration } from '@/features/audit/domain/resolveAuditConfiguration';
import type { Audit, ResolveAuditConfigurationInput } from '@/types/audit';
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

  return {
    configuration,
    evaluation: {
      architecture,
      cyclicPackages,
      genericRules: ruleEvaluation.genericRules,
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
