'use client';
import { View } from '@zora/view';
import React from 'react';

import { ArchitectureAnalysisPanel } from '@/features/audit/adapters/inbound/react/ArchitectureAnalysisPanel';
import { AuditRuleList } from '@/features/audit/adapters/inbound/react/AuditRuleList';
import type { Audit } from '@/types/audit';
import type { CycleInspection, CycleSelection } from '@/types/auditVisualization';

/*** Render architecture analysis and audit findings while the Rules sidebar tab is active. */
export function AuditRulePanel({
  evaluation,
  cycleSelection,
  inspectedCycleId,
  onCycleInspectionChange,
}: AuditRulePanelProps) {
  return (
    <View gap="l">
      <ArchitectureAnalysisPanel evaluation={evaluation} />
      <AuditRuleList
        evaluation={evaluation}
        cycleSelection={cycleSelection}
        inspectedCycleId={inspectedCycleId}
        onCycleInspectionChange={onCycleInspectionChange}
      />
    </View>
  );
}

interface AuditRulePanelProps {
  readonly inspectedCycleId?: string | null;
  readonly evaluation: Audit['evaluation'];
  readonly cycleSelection: CycleSelection;
  readonly onCycleInspectionChange: (inspection: CycleInspection | null) => void;
}
