'use client';
import type { RuleFinding } from '@ankhorage/rules';
import { Text } from '@zora/text';
import { View } from '@zora/view';
import React from 'react';

import { CyclicDependenciesRuleDetails } from '@/features/audit/adapters/inbound/react/CyclicDependenciesRuleDetails';
import type { Audit, AuditRuleResult } from '@/types/audit';
import type { CycleInspection, CycleSelection } from '@/types/auditVisualization';

/*** Render specialized cycle findings plus generic architecture findings. */
export function AuditRuleList({
  evaluation,
  cycleSelection,
  inspectedCycleId,
  onCycleInspectionChange,
}: AuditRuleListProps) {
  const genericFindings = evaluation.genericRules.findings.filter(
    ({ ruleId }) => ruleId !== 'cyclic-dependencies',
  );

  return (
    <View gap="l">
      {evaluation.rules
        .filter((rule) => rule.status === 'failed')
        .map((rule) => (
          <RuleDetails
            key={rule.id}
            evaluation={evaluation}
            rule={rule}
            cycleSelection={cycleSelection}
            inspectedCycleId={inspectedCycleId}
            onCycleInspectionChange={onCycleInspectionChange}
          />
        ))}
      {genericFindings.map((finding, index) => (
        <GenericRuleFindingDetails
          key={finding.ruleId + ':' + index}
          finding={finding}
        />
      ))}
    </View>
  );
}

/*** Dispatch one violated legacy presentation rule to its dedicated renderer. */
function RuleDetails({
  evaluation,
  cycleSelection,
  inspectedCycleId,
  onCycleInspectionChange,
  rule,
}: RuleDetailsProps) {
  if (rule.id === 'cyclic-dependencies') {
    return (
      <CyclicDependenciesRuleDetails
        cycles={evaluation.cyclicPackages}
        cycleSelection={cycleSelection}
        inspectedCycleId={inspectedCycleId}
        onCycleInspectionChange={onCycleInspectionChange}
      />
    );
  }

  return (
    <View gap="xs" p="m">
      <Text variant="label" weight="bold">
        {rule.id}
      </Text>
      {rule.details.map((detail, index) => (
        <Text key={detail + ':' + index} numberOfLines={1} variant="code">
          {detail}
        </Text>
      ))}
    </View>
  );
}

/*** Render one canonical generic Rule finding without provider-specific branching. */
function GenericRuleFindingDetails({ finding }: { readonly finding: RuleFinding }) {
  return (
    <View gap="xs" p="m">
      <Text variant="label" weight="bold">
        {finding.ruleId} · {finding.severity}
      </Text>
      <Text variant="caption">{finding.message}</Text>
      {finding.subjects.map((subject) => (
        <Text key={subject.id} numberOfLines={1} variant="code">
          {subject.path ?? subject.id}
        </Text>
      ))}
    </View>
  );
}

interface AuditRuleListProps {
  readonly inspectedCycleId?: string | null;
  readonly evaluation: Audit['evaluation'];
  readonly cycleSelection: CycleSelection;
  readonly onCycleInspectionChange: (inspection: CycleInspection | null) => void;
}

interface RuleDetailsProps extends AuditRuleListProps {
  readonly rule: AuditRuleResult;
}
