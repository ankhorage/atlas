import { describe, expect, it } from '@artiphishle/testosterone';

import { resolveAuditConfiguration } from '@/features/audit/domain/resolveAuditConfiguration';

describe('[resolveAuditConfiguration]', () => {
  it('defaults cyclic-dependencies to blocking enforcement without an architecture target', () => {
    const configuration = resolveAuditConfiguration();

    expect(configuration.architectureTarget).toBeUndefined();
    expect(configuration.failOnRuleViolation).toBe(true);
    expect(configuration.rules).toEqual([{ id: 'cyclic-dependencies', mode: 'block' }]);
  });

  it('preserves explicit target, rule, and execution overrides deterministically', () => {
    const configuration = resolveAuditConfiguration({
      architectureTarget: { kind: 'model', id: 'clean' },
      failOnRuleViolation: false,
      rules: [
        { id: 'cyclic-dependencies', mode: 'audit' },
        { id: 'cyclic-dependencies', mode: 'off' },
      ],
    });

    expect(configuration.architectureTarget).toEqual({ kind: 'model', id: 'clean' });
    expect(configuration.failOnRuleViolation).toBe(false);
    expect(configuration.rules).toEqual([{ id: 'cyclic-dependencies', mode: 'off' }]);
  });
});
