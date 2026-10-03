'use client';

import type { ElementsDefinition } from 'cytoscape';
import { useEffect } from 'react';

import { createCycleFocus } from '@/features/audit/utils/cycleVisualization';
import { readNodeDefinitionId } from '@/features/graph-view/utils/readNodeDefinitionId';
import type { CycleHighlight } from '@/types/auditVisualization';

/*** Expands cycle projection only when the current view does not contain all active evidence. */
export function useGraphFocus(input: UseGraphFocusInput) {
  const {
    cycleHighlights,
    currentPackage,
    setCurrentPackage,
    setSubPackageDepth,
    subPackageDepth,
    visibleElements,
  } = input;

  useEffect(() => {
    if (visibleElements === null || cycleHighlights.length === 0) return;
    ensureCycleProjection({
      cycleHighlights,
      currentPackage,
      setCurrentPackage,
      setSubPackageDepth,
      subPackageDepth,
      visibleElements,
    });
  }, [
    cycleHighlights,
    currentPackage,
    setCurrentPackage,
    setSubPackageDepth,
    subPackageDepth,
    visibleElements,
  ]);
}

/*** Expands only the projection dimensions required to expose every active cycle package. */
function ensureCycleProjection(input: UseGraphFocusInput): boolean {
  if (input.visibleElements === null) return false;
  const activePackageNames = [
    ...new Set(input.cycleHighlights.flatMap(highlight => highlight.cycle.packages)),
  ];
  const visibleNodeIds = new Set(
    input.visibleElements.nodes
      .map(node => readNodeDefinitionId(node))
      .filter((id): id is string => id !== null)
  );
  if (activePackageNames.every(packageName => visibleNodeIds.has(packageName))) return false;

  const focus = createCycleFocus(input.cycleHighlights);
  if (!focus) return false;

  const normalizedCurrentPackage = input.currentPackage.replace(/\//g, '.');
  const scopeChanged = focus.currentPackage !== normalizedCurrentPackage;
  const depthChanged = focus.packageDepth > input.subPackageDepth;

  if (scopeChanged) input.setCurrentPackage(focus.currentPackage);
  if (depthChanged) input.setSubPackageDepth(focus.packageDepth);
  return scopeChanged || depthChanged;
}

interface UseGraphFocusInput {
  readonly cycleHighlights: readonly CycleHighlight[];
  readonly currentPackage: string;
  readonly setCurrentPackage: (path: string) => void;
  readonly setSubPackageDepth: (depth: number) => void;
  readonly subPackageDepth: number;
  readonly visibleElements: ElementsDefinition | null;
}
