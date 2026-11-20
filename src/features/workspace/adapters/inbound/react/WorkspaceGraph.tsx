'use client';
import type { SelectionIntent } from '@ankhorage/utility/selection';
import { ActivityIndicator } from '@ankhorage/zora/web/activity-indicator';
import { View } from '@ankhorage/zora/web/view';
import React from 'react';

import { CycleInspector } from '@/features/audit/adapters/inbound/react/CycleInspector';
import { DependencyGraphView } from '@/features/graph-view/adapters/inbound/react/DependencyGraphView';
import type { CycleHighlight, CycleInspection } from '@/types/auditVisualization';
import type { PackageDependencyGraph } from '@/types/dependencyAnalysis';

/*** Render the workspace graph together with its optional cycle inspector overlay. */
export function WorkspaceGraph({
  currentPackage,
  cycleHighlights,
  cycleInspection,
  cycleEvidenceHidden,
  revealedCycleId,
  packageGraph,
  selectedGraphNodeIds,
  setCurrentPackage,
  onGraphNodeSelect,
  onCloseInspection,
  onCycleEvidenceVisibilityChange,
  onRevealCycle,
}: WorkspaceGraphProps) {
  if (packageGraph === null) {
    return (
      <View align="center" flex={1} justify="center">
        <ActivityIndicator testID="loader" />
      </View>
    );
  }

  return (
    <DependencyGraphView
      currentPackage={currentPackage}
      setCurrentPackage={setCurrentPackage}
      packageGraph={packageGraph}
      selectedNodeIds={selectedGraphNodeIds}
      cycleHighlights={cycleHighlights}
      cycleInspection={cycleInspection}
      onNodeSelect={onGraphNodeSelect}
      onCycleEvidenceVisibilityChange={onCycleEvidenceVisibilityChange}
      revealedCycle={revealedCycleId === cycleInspection?.id ? cycleInspection : null}
      overlay={
        cycleInspection === null ? null : (
          <CycleInspector
            hiddenEvidence={cycleEvidenceHidden}
            inspection={cycleInspection}
            onClose={onCloseInspection}
            onReveal={onRevealCycle}
          />
        )
      }
    />
  );
}

interface WorkspaceGraphProps {
  readonly currentPackage: string;
  readonly cycleHighlights: readonly CycleHighlight[];
  readonly cycleInspection: CycleInspection | null;
  readonly cycleEvidenceHidden: boolean;
  readonly revealedCycleId: string | null;
  readonly packageGraph: PackageDependencyGraph | null;
  readonly selectedGraphNodeIds: readonly string[];
  readonly setCurrentPackage: (path: string) => void;
  readonly onGraphNodeSelect: (id: string, intent: SelectionIntent) => void;
  readonly onCloseInspection: () => void;
  readonly onCycleEvidenceVisibilityChange: (hidden: boolean) => void;
  readonly onRevealCycle: () => void;
}
