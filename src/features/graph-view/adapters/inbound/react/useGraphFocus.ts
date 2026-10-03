'use client';

import type { ElementsDefinition } from 'cytoscape';
import { useEffect, useRef } from 'react';

import { createCycleFocus } from '@/features/audit/utils/cycleVisualization';
import { readNodeDefinitionId } from '@/features/graph-view/utils/readNodeDefinitionId';
import type { CycleHighlight } from '@/types/auditVisualization';

/*** Expands cycle projection only as needed, then requests one intentional whole-graph focus. */
export function useGraphFocus(input: UseGraphFocusInput) {
  const handledCycleSignatureRef = useRef<string | null>(null);
  const {
    cycleHighlights,
    currentPackage,
    requestCycleFocus,
    setCurrentPackage,
    setSubPackageDepth,
    subPackageDepth,
    visibleElements,
  } = input;

  useEffect(
    () =>
      runCycleProjectionFocus(
        {
          cycleHighlights,
          currentPackage,
          requestCycleFocus,
          setCurrentPackage,
          setSubPackageDepth,
          subPackageDepth,
          visibleElements,
        },
        handledCycleSignatureRef
      ),
    [
      cycleHighlights,
      currentPackage,
      requestCycleFocus,
      setCurrentPackage,
      setSubPackageDepth,
      subPackageDepth,
      visibleElements,
    ]
  );
}

/*** Runs one cycle-focus iteration, expanding projection before requesting canonical viewport focus. */
function runCycleProjectionFocus(
  input: UseGraphFocusInput,
  handledCycleSignatureRef: { current: string | null }
) {
  if (input.visibleElements === null) return;

  if (input.cycleHighlights.length === 0) {
    handledCycleSignatureRef.current = null;
    input.requestCycleFocus(null);
    return;
  }

  const signature = getCycleSignature(input.cycleHighlights);
  if (handledCycleSignatureRef.current === signature) return;
  if (ensureCycleProjection(input)) return;
  input.requestCycleFocus(signature);
  handledCycleSignatureRef.current = signature;
}

/*** Returns a stable identity for the current active-cycle set. */
function getCycleSignature(highlights: readonly CycleHighlight[]): string {
  return highlights
    .map(highlight => highlight.id)
    .sort()
    .join('|');
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
  readonly requestCycleFocus: (signature: string | null) => void;
  readonly setCurrentPackage: (path: string) => void;
  readonly setSubPackageDepth: (depth: number) => void;
  readonly subPackageDepth: number;
  readonly visibleElements: ElementsDefinition | null;
}
