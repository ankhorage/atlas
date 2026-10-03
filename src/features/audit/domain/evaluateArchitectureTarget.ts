import type { SourceGraph } from '@ankhorage/dependency-graph';
import type { RulesConfig } from '@ankhorage/rules';
import { evaluateArchitecture, evaluateArchitectureProfile } from '@ankhorage/rules-architecture';

import type { AuditArchitectureEvaluation, AuditArchitectureTarget } from '@/types/audit';

const MODEL_EVALUATION_CONFIG: RulesConfig = {
  version: 1,
  rules: [{ id: 'architecture-dependency-direction', enabled: true }],
};

/*** Evaluate only an explicitly configured architecture model or profile target. */
export function evaluateArchitectureTarget(
  sourceGraph: SourceGraph,
  target: AuditArchitectureTarget | undefined
): AuditArchitectureEvaluation | undefined {
  if (target === undefined) return undefined;

  if (target.kind === 'model') {
    return {
      target,
      result: evaluateArchitecture(sourceGraph, target.id, {
        config: MODEL_EVALUATION_CONFIG,
      }),
    };
  }

  return {
    target,
    result: evaluateArchitectureProfile(sourceGraph, target.id),
  };
}
