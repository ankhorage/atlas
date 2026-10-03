import { describe, expect, it, render } from '@artiphishle/testosterone';
import { ZoraProvider } from '@zora/ZoraProvider';
import React from 'react';

import { AuditRulePanel } from '@/features/audit/adapters/inbound/react/AuditRulePanel';
import type { Audit } from '@/types/audit';

describe('[AuditRulePanel]', () => {
  it('renders architecture detection evidence independently from rule enforcement', () => {
    const { getByText } = render(
      <ZoraProvider mode="light">
        <AuditRulePanel
          evaluation={architectureEvaluation}
          cycleSelection={{ highlights: [], selectedIds: [], setSelected: () => undefined }}
          onCycleInspectionChange={() => undefined}
        />
      </ZoraProvider>,
    );

    expect(getByText('Architecture Analysis')).toBeDefined();
    expect(getByText('hexagonal · confidence 75% · score 3.00')).toBeDefined();
    expect(getByText('+ Ports and adapters are separated.')).toBeDefined();
    expect(getByText('! Domain imports an adapter.')).toBeDefined();
    expect(getByText('Missing capabilities: implements')).toBeDefined();
    expect(getByText('Detection only · no enforcement target selected')).toBeDefined();
  });

  it('renders violated rule content supplied by the composition root', () => {
    const { getByText } = render(
      <ZoraProvider mode="light">
        <AuditRulePanel
          evaluation={evaluation}
          cycleSelection={{ highlights: [], selectedIds: [], setSelected: () => undefined }}
          onCycleInspectionChange={() => undefined}
        />
      </ZoraProvider>
    );

    expect(getByText('Cyclic Dependencies')).toBeDefined();
  });
});

const evaluation: Audit['evaluation'] = {
  architecture: { candidates: [] },
  genericRules: { diagnostics: [], findings: [] },
  cyclicPackages: [
    {
      packages: ['app.a', 'app.b', 'app.a'],
      edges: [],
    },
  ],
  rules: [
    {
      id: 'cyclic-dependencies',
      status: 'failed',
      policy: 'blocking',
      message: 'Detected a cyclic dependency.',
      details: [],
      evidence: {},
    },
  ],
};

const architectureEvaluation: Audit['evaluation'] = {
  architecture: {
    candidates: [
      {
        modelId: 'hexagonal',
        confidence: 0.75,
        score: 3,
        roleAssignments: [],
        supportingEvidence: [
          {
            kind: 'topology',
            message: 'Ports and adapters are separated.',
            weight: 1,
          },
        ],
        contradictions: [
          {
            message: 'Domain imports an adapter.',
            relationKind: 'imports',
            sourceRole: 'domain',
            sourceSemanticPath: 'fixture:file:src/domain/order.ts',
            targetRole: 'adapter',
            targetSemanticPath: 'fixture:file:src/adapters/postgres.ts',
          },
        ],
        unavailableCapabilities: ['implements'],
      },
    ],
  },
  genericRules: { diagnostics: [], findings: [] },
  cyclicPackages: [],
  rules: [],
};
