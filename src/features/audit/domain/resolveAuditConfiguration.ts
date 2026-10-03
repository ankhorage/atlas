import type {
  AuditConfiguration,
  AuditRuleConfiguration,
  ResolveAuditConfigurationInput,
} from '@/types/audit';

/*** Resolve explicit audit overrides without inferring an architecture enforcement target. */
export function resolveAuditConfiguration(
  input: ResolveAuditConfigurationInput = {}
): AuditConfiguration {
  let cyclicDependenciesMode: AuditRuleConfiguration['mode'] = 'block';

  for (const rule of input.rules ?? []) {
    switch (rule.id) {
      case 'cyclic-dependencies':
        cyclicDependenciesMode = rule.mode;
        break;
      default:
        throw new Error(`Unknown audit rule "${rule.id}".`);
    }
  }

  return {
    ...(input.architectureTarget === undefined
      ? {}
      : { architectureTarget: input.architectureTarget }),
    failOnRuleViolation: input.failOnRuleViolation ?? true,
    rules: [{ id: 'cyclic-dependencies', mode: cyclicDependenciesMode }],
  };
}
