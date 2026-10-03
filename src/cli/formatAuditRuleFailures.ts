import type { AuditRuleResult } from '@/types/audit';

/*** Formats blocking audit-rule failures for terminal and CI output. */
export function formatAuditRuleFailures(
  results: readonly AuditRuleResult[],
  artifactPath: string
): string {
  const failures = results.filter(
    result => result.policy === 'blocking' && result.status === 'failed'
  );
  const ruleLines = failures.flatMap(result => {
    const details =
      result.details.length > 0
        ? result.details.map(detail => `  ${detail}`)
        : [`  ${result.message}`];

    return [`✗ ${result.id}`, ...details, ''];
  });

  return ['Atlas audit failed', '', ...ruleLines, `Audit: ${artifactPath}`].join('\n');
}
