import { describe, expect, it } from '@artiphishle/testosterone';

import { formatAuditRuleFailures } from '@/cli/formatAuditRuleFailures';
import type { AuditRuleResult } from '@/types/audit';

describe('[formatAuditRuleFailures]', () => {
  it('prints blocking rule IDs, details, and the retained artifact path', () => {
    const result: AuditRuleResult = {
      id: 'cyclic-dependencies',
      status: 'failed',
      policy: 'blocking',
      message: 'Detected a package cycle.',
      details: ['a → b → a'],
      evidence: {},
    };

    const output = formatAuditRuleFailures([result], '/tmp/audit.json');

    expect(output.includes('Atlas audit failed')).toBe(true);
    expect(output.includes('✗ cyclic-dependencies')).toBe(true);
    expect(output.includes('  a → b → a')).toBe(true);
    expect(output.includes('Audit: /tmp/audit.json')).toBe(true);
  });
});
