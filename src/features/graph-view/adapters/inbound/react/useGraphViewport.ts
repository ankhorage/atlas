import type {
  GraphViewController,
  GraphViewMeasurement,
} from '@zora/graph-view';
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { getAdaptiveCycleLayoutSpacing } from '@/features/audit/utils/getAdaptiveCycleLayoutSpacing';
import type { CycleHighlight } from '@/types/auditVisualization';

/***
 * Mirrors owner viewport state and performs cycle focus only after GraphView reports settled layout.
 * Normal layout completion remains passive; explicit Fit and settled active-cycle focus are the only
 * paths that request canonical optimized whole-graph fitting.
 */
export function useGraphViewport(input: UseGraphViewportInput) {
  const [controller, setController] = useState<GraphViewController | null>(null);
  const controllerRef = useRef<GraphViewController | null>(null);
  const handledCycleFocusRef = useRef<string | null>(null);
  const pendingCycleRefitRef = useRef<string | null>(null);
  const spacingFactorRef = useRef(input.spacingFactor);
  const [viewport, setViewport] = useState({ zoom: 1, min: 0.5, max: 2 });
  const cycleFocus = useMemo(
    () => createCycleFocusTarget(input.cycleHighlights),
    [input.cycleHighlights]
  );

  useEffect(() => {
    spacingFactorRef.current = input.spacingFactor;
  }, [input.spacingFactor]);

  useEffect(() => {
    if (cycleFocus !== null) {
      if (
        pendingCycleRefitRef.current !== null &&
        pendingCycleRefitRef.current !== cycleFocus.signature
      ) {
        pendingCycleRefitRef.current = null;
      }
      return;
    }
    handledCycleFocusRef.current = null;
    pendingCycleRefitRef.current = null;
  }, [cycleFocus]);

  /*** Captures the controller before synchronizing the initial viewport. */
  const handleReady = (nextController: GraphViewController) => {
    controllerRef.current = nextController;
    setController(nextController);
    synchronizeGraphViewport(nextController, setViewport);
  };

  /*** Reads the controller synchronously, including events before React commits readiness. */
  const handleViewportChange = () => {
    if (controllerRef.current !== null)
      synchronizeGraphViewport(controllerRef.current, setViewport);
  };

  /***
   * Focuses active cycles only from settled owner geometry, then refits once after adaptive relayout.
   * Missing cycle evidence is left to projection expansion and never measured as a partial cycle.
   */
  const handleLayoutComplete = (
    nextController: GraphViewController,
    visibleNodeIds: readonly string[]
  ) => {
    synchronizeGraphViewport(nextController, setViewport);

    const pendingRefit = pendingCycleRefitRef.current;
    if (pendingRefit !== null && pendingRefit === cycleFocus?.signature) {
      pendingCycleRefitRef.current = null;
      nextController.fit();
      synchronizeGraphViewport(nextController, setViewport);
    }

    if (cycleFocus === null || handledCycleFocusRef.current === cycleFocus.signature) return;
    const visibleIds = new Set(visibleNodeIds);
    if (!cycleFocus.nodeIds.every(nodeId => visibleIds.has(nodeId))) return;

    handledCycleFocusRef.current = cycleFocus.signature;
    focusActiveCycle({
      controller: nextController,
      focus: cycleFocus,
      handleSpacingFactorChange,
      pendingCycleRefitRef,
      setViewport,
      spacingFactorRef,
    });
  };

  /*** Mirrors owner spacing updates immediately so post-Fit measurement uses the accepted spacing. */
  const handleSpacingFactorChange = useCallback(
    (spacingFactor: number) => {
      spacingFactorRef.current = spacingFactor;
      input.onSpacingFactorChange(spacingFactor);
    },
    [input.onSpacingFactorChange]
  );

  /*** Runs the canonical readable fit and spacing optimization from explicit user intent. */
  const fitGraph = () => {
    const nextController = controllerRef.current;
    if (nextController === null) return;
    fitGraphWithOptimizedSpacing(nextController, setViewport);
  };

  return {
    controller,
    fitGraph,
    handleLayoutComplete,
    handleReady,
    handleSpacingFactorChange,
    handleViewportChange,
    ...viewport,
  };
}

/*** Fits the whole graph, measures active nodes, and requests only a justified spacing reduction. */
function focusActiveCycle(input: FocusActiveCycleInput) {
  fitGraphWithOptimizedSpacing(input.controller, input.setViewport);
  const measurement = input.controller.measureNodes?.(input.focus.nodeIds);
  if (measurement === null || measurement === undefined) return;
  if (measurement.nodes.length !== input.focus.nodeIds.length) return;

  const currentSpacing = input.spacingFactorRef.current;
  const nextSpacing = getAdaptiveCycleLayoutSpacing(
    currentSpacing,
    readCycleLayoutMetrics(measurement)
  );
  if (nextSpacing >= currentSpacing) return;

  input.pendingCycleRefitRef.current = input.focus.signature;
  input.handleSpacingFactorChange(nextSpacing);
}

/*** Converts renderer-neutral GraphView measurements into the cycle-spacing policy metrics. */
function readCycleLayoutMetrics(measurement: GraphViewMeasurement) {
  const nodeBounds = measurement.nodes.map(node => ({
    x1: node.position.x - node.size.width / 2,
    y1: node.position.y - node.size.height / 2,
    x2: node.position.x + node.size.width / 2,
    y2: node.position.y + node.size.height / 2,
  }));
  const distances = measurement.nodes.flatMap((node, index) =>
    measurement.nodes
      .slice(index + 1)
      .map(other => Math.hypot(node.position.x - other.position.x, node.position.y - other.position.y))
  );
  const cycleWidth =
    Math.max(...nodeBounds.map(bounds => bounds.x2)) -
    Math.min(...nodeBounds.map(bounds => bounds.x1));
  const cycleHeight =
    Math.max(...nodeBounds.map(bounds => bounds.y2)) -
    Math.min(...nodeBounds.map(bounds => bounds.y1));
  const averageNodeSize =
    measurement.nodes.reduce(
      (sum, node) => sum + Math.min(node.size.width, node.size.height),
      0
    ) / measurement.nodes.length;
  const averageNodeDistance =
    distances.length === 0
      ? 0
      : distances.reduce((sum, distance) => sum + distance, 0) / distances.length;

  return {
    viewportWidth: measurement.viewport.width,
    viewportHeight: measurement.viewport.height,
    cycleWidth,
    cycleHeight,
    averageNodeSize,
    averageNodeDistance,
  };
}

/*** Builds a stable active-cycle identity and unique rendered node set. */
function createCycleFocusTarget(highlights: readonly CycleHighlight[]): CycleFocusTarget | null {
  if (highlights.length === 0) return null;
  return {
    signature: highlights
      .map(highlight => highlight.id)
      .sort()
      .join('|'),
    nodeIds: [...new Set(highlights.flatMap(highlight => highlight.cycle.packages))],
  };
}

/*** Reuses ZORA's measured whole-graph optimization for explicit and cycle-focus intent. */
function fitGraphWithOptimizedSpacing(
  controller: GraphViewController,
  setViewport: Dispatch<SetStateAction<GraphViewportState>>
) {
  controller.fit({ optimizeSpacing: true });
  synchronizeGraphViewport(controller, setViewport);
}

/*** Publishes only changed viewport values, including range changes without a zoom event. */
function synchronizeGraphViewport(
  controller: GraphViewController,
  setViewport: Dispatch<SetStateAction<GraphViewportState>>
) {
  const { zoom } = controller.getViewport();
  const { min, max } = controller.getZoomRange();
  setViewport(previous =>
    previous.zoom === zoom && previous.min === min && previous.max === max
      ? previous
      : { zoom, min, max }
  );
}

interface UseGraphViewportInput {
  readonly cycleHighlights: readonly CycleHighlight[];
  readonly onSpacingFactorChange: (spacingFactor: number) => void;
  readonly spacingFactor: number;
}

interface CycleFocusTarget {
  readonly signature: string;
  readonly nodeIds: readonly string[];
}

interface FocusActiveCycleInput {
  readonly controller: GraphViewController;
  readonly focus: CycleFocusTarget;
  readonly handleSpacingFactorChange: (spacingFactor: number) => void;
  readonly pendingCycleRefitRef: { current: string | null };
  readonly setViewport: Dispatch<SetStateAction<GraphViewportState>>;
  readonly spacingFactorRef: { current: number };
}

interface GraphViewportState {
  readonly zoom: number;
  readonly min: number;
  readonly max: number;
}
