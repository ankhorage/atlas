'use client';
import React from 'react';

import { AuditRuleList } from '@/features/audit/adapters/inbound/react/AuditRuleList';
import type { Audit } from '@/types/audit';
import type { CycleInspection, CycleSelection } from '@/types/auditVisualization';

/*** Render only actual audit-rule findings while the Rules sidebar tab is active. */
export function AuditRulePanel({
  evaluation,
  cycleSelection,
  inspectedCycleId,
  onCycleInspectionChange,
}: AuditRulePanelProps) {
  return (
    <AuditRuleList
      evaluation={evaluation}
      cycleSelection={cycleSelection}
      inspectedCycleId={inspectedCycleId}
      onCycleInspectionChange={onCycleInspectionChange}
    />
  );
}

interface AuditRulePanelProps {
  readonly inspectedCycleId?: string | null;
  readonly evaluation: Audit['evaluation'];
  readonly cycleSelection: CycleSelection;
  readonly onCycleInspectionChange: (inspection: CycleInspection | null) => void;
}
