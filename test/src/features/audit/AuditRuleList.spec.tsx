import { describe, expect, it, render } from '@artiphishle/testosterone';
import { ZoraProvider } from '@zora/ZoraProvider';
import React from 'react';

import { AuditRuleList } from '@/features/audit/adapters/inbound/react/AuditRuleList';
import type { Audit, AuditRuleResult, PackageCycleDetail } from '@/types/audit';

const cycles: readonly PackageCycleDetail[] = [
  {
    packages: ['app.a', 'app.b', 'app.a'],
    edges: [
      {
        from: 'app.a',
        to: 'app.b',
        via: [
          {
            filePath: 'src/a.ts',
            fileClass: 'A',
            importName: 'app.b.B',
            isIntrinsic: true,
          },
        ],
      },
      { from: 'app.b', to: 'app.a', via: [] },
    ],
  },
  {
    packages: ['app.self', 'app.self'],
    edges: [{ from: 'app.self', to: 'app.self', via: [] }],
  },
];

describe('[AuditRuleList]', () => {
  it('shows violated cycles as compact single-line rows with trailing switches', () => {
    const { container, getByText } = render(
      <ZoraProvider mode="light">
        <AuditRuleList
          evaluation={failedEvaluation}
          cycleSelection={{ highlights: [], selectedIds: [], setSelected: () => undefined }}
          onCycleInspectionChange={() => undefined}
        />
      </ZoraProvider>
    );

    expect(getByText('Cyclic Dependencies')).toBeDefined();
    expect(getByText('2')).toBeDefined();
    expect(getByText('C1: app.a → app.b → app.a')).toBeDefined();
    expect(getByText('C2: app.self → app.self')).toBeDefined();

    const switches = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid^="cycle-switch-"]')
    );
    expect(switches.length).toBe(2);
    expect(container.querySelector('[data-testid="cycle-row-0"]')?.textContent).toContain(
      'C1: app.a → app.b → app.a'
    );
    expect(container.textContent?.includes('src/a.ts')).toBe(false);
  });

  it('does not render satisfied rules in the Rules tab', () => {
    const { container } = render(
      <ZoraProvider mode="light">
        <AuditRuleList
          evaluation={passedEvaluation}
          cycleSelection={{ highlights: [], selectedIds: [], setSelected: () => undefined }}
          onCycleInspectionChange={() => undefined}
        />
      </ZoraProvider>
    );

    expect(container.textContent).toBe('');
  });
});

const failedRule: AuditRuleResult = {
  id: 'cyclic-dependencies',
  status: 'failed',
  policy: 'blocking',
  message: 'Detected 2 cyclic package dependencies.',
  details: cycles.map(cycle => cycle.packages.join(' → ')),
  evidence: { cycles },
};

const passedRule: AuditRuleResult = {
  id: 'cyclic-dependencies',
  status: 'passed',
  policy: 'blocking',
  message: 'No cyclic package dependencies detected.',
  details: [],
  evidence: { cycles: [] },
};

const failedEvaluation: Audit['evaluation'] = {
  architecture: { candidates: [] },
  genericRules: { diagnostics: [], findings: [] },
  cyclicPackages: cycles,
  rules: [failedRule],
};

const passedEvaluation: Audit['evaluation'] = {
  architecture: { candidates: [] },
  genericRules: { diagnostics: [], findings: [] },
  cyclicPackages: [],
  rules: [passedRule],
};
