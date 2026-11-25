import type { GraphViewController, GraphViewMeasurement } from '@ankhorage/zora/web/graph-view';
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { CycleHighlight } from '@/types/auditVisualization';

/***
 * Mirrors owner viewport state and fits each distinct settled topology once.
 * Duplicate layouts remain passive so user navigation survives renderer updates.
 */
export function useGraphViewport(input: UseGraphViewportInput) {
  const [controller, setController] = useState<GraphViewController | null>(null);
  const controllerRef = useRef<GraphViewController | null>(null);
  const fittedTopologyRef = useRef<TopologyFit | null>(null);
  const settledLayoutRef = useRef(input.layout);
  const [viewport, setViewport] = useState({ zoom: 1, min: 0.5, max: 2 });
  const cycleFocus = useCycleViewportFocus(input, setViewport);

  /*** Captures the controller before synchronizing the initial viewport. */
  const handleReady = (nextController: GraphViewController) => {
    if (controllerRef.current !== nextController) fittedTopologyRef.current = null;
    controllerRef.current = nextController;
    setController(nextController);
    synchronizeGraphViewport(nextController, setViewport);
  };

  /*** Reads the controller synchronously, including events before React commits readiness. */
  const handleViewportChange = () => {
    if (controllerRef.current !== null)
      synchronizeGraphViewport(controllerRef.current, setViewport);
  };

  /*** Runs the readable fit and spacing optimization requested explicitly by the user. */
  const fitGraph = useCallback(() => {
    const nextController = controllerRef.current;
    if (nextController === null) return;
    fitGraphWithOptimizedSpacing(nextController, setViewport);
  }, []);

  return {
    controller,
    fitGraph,
    handleLayoutComplete: (
      nextController: GraphViewController,
      visibleNodeIds: readonly string[]
    ) => {
      const topology = createTopologyFit(nextController, visibleNodeIds);
      const layoutChanged = settledLayoutRef.current !== input.layout;
      settledLayoutRef.current = input.layout;
      if (
        topology !== null &&
        (layoutChanged || shouldFitTopology(nextController, topology, fittedTopologyRef.current))
      ) {
        fittedTopologyRef.current = topology;
        fitGraphToViewport(nextController, setViewport);
      }
      cycleFocus.handleLayoutComplete(nextController, visibleNodeIds);
    },
    handleReady,
    handleSpacingFactorChange: cycleFocus.handleSpacingFactorChange,
    handleViewportChange,
    ...viewport,
  };
}

/*** Requires a non-empty, fully measured layout before fitting a changed topology. */
function createTopologyFit(
  controller: GraphViewController,
  visibleNodeIds: readonly string[]
): TopologyFit | null {
  const uniqueVisibleNodeIds = [...new Set(visibleNodeIds)].sort();
  if (uniqueVisibleNodeIds.length === 0) return null;

  const measurement = controller.measureNodes?.(uniqueVisibleNodeIds);
  if (
    measurement === null ||
    measurement === undefined ||
    measurement.viewport.width <= 0 ||
    measurement.viewport.height <= 0 ||
    measurement.nodes.length !== uniqueVisibleNodeIds.length ||
    measurement.nodes.some(node => node.size.width <= 0 || node.size.height <= 0)
  )
    return null;
  return { measurement, signature: uniqueVisibleNodeIds.join('|') };
}

/*** Refit when a completed layout moves the retained topology beyond the visible canvas. */
function shouldFitTopology(
  controller: GraphViewController,
  topology: TopologyFit,
  fittedTopology: TopologyFit | null
): boolean {
  if (fittedTopology?.signature !== topology.signature) return true;
  // A zoomed-in viewport is explicitly user-owned; duplicate layout callbacks must not reset it.
  if (controller.getViewport().zoom > 1) return false;
  return !areMeasuredNodesVisible(controller, topology.measurement);
}

/*** Reject a stale fit whenever rendered node bounds escape the measured GraphView viewport. */
function areMeasuredNodesVisible(
  controller: GraphViewController,
  measurement: GraphViewMeasurement
): boolean {
  const { pan, zoom } = controller.getViewport();
  return measurement.nodes.every(node => {
    const halfWidth = (node.size.width * zoom) / 2;
    const halfHeight = (node.size.height * zoom) / 2;
    const centerX = node.position.x * zoom + pan.x;
    const centerY = node.position.y * zoom + pan.y;
    return (
      centerX - halfWidth >= 0 &&
      centerY - halfHeight >= 0 &&
      centerX + halfWidth <= measurement.viewport.width &&
      centerY + halfHeight <= measurement.viewport.height
    );
  });
}

/*** Owns active-cycle focus without changing the selected layout spacing. */
function useCycleViewportFocus(
  input: UseGraphViewportInput,
  setViewport: Dispatch<SetStateAction<GraphViewportState>>
) {
  const { cycleHighlights, onSpacingFactorChange } = input;
  const handledCycleFocusRef = useRef<string | null>(null);
  const cycleFocus = useMemo(() => createCycleFocusTarget(cycleHighlights), [cycleHighlights]);

  useEffect(() => {
    if (cycleFocus === null) handledCycleFocusRef.current = null;
  }, [cycleFocus]);

  const handleSpacingFactorChange = useCallback(
    (nextSpacingFactor: number) => {
      onSpacingFactorChange(nextSpacingFactor);
    },
    [onSpacingFactorChange]
  );

  const handleLayoutComplete = (
    controller: GraphViewController,
    visibleNodeIds: readonly string[]
  ) =>
    handleSettledCycleFocus({
      controller,
      cycleFocus,
      handledCycleFocusRef,
      setViewport,
      visibleNodeIds,
    });

  return { handleLayoutComplete, handleSpacingFactorChange };
}

/*** Focuses an active cycle only from settled owner geometry. */
function handleSettledCycleFocus(input: SettledCycleFocusInput) {
  synchronizeGraphViewport(input.controller, input.setViewport);

  const focus = input.cycleFocus;
  if (focus === null || input.handledCycleFocusRef.current === focus.signature) return;
  const visibleIds = new Set(input.visibleNodeIds);
  if (!focus.nodeIds.every(nodeId => visibleIds.has(nodeId))) return;

  input.handledCycleFocusRef.current = focus.signature;
  focusActiveCycle(input.controller, input.setViewport);
}

/*** Fit cycle evidence without changing the user's selected layout spacing. */
function focusActiveCycle(
  controller: GraphViewController,
  setViewport: Dispatch<SetStateAction<GraphViewportState>>
) {
  fitGraphToViewport(controller, setViewport);
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

/*** Fits automatically changed geometry while preserving the user's spacing selection. */
function fitGraphToViewport(
  controller: GraphViewController,
  setViewport: Dispatch<SetStateAction<GraphViewportState>>
) {
  controller.fit();
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
  readonly layout: string;
  readonly onSpacingFactorChange: (spacingFactor: number) => void;
  readonly spacingFactor: number;
}

interface CycleFocusTarget {
  readonly signature: string;
  readonly nodeIds: readonly string[];
}

interface SettledCycleFocusInput {
  readonly controller: GraphViewController;
  readonly cycleFocus: CycleFocusTarget | null;
  readonly handledCycleFocusRef: { current: string | null };
  readonly setViewport: Dispatch<SetStateAction<GraphViewportState>>;
  readonly visibleNodeIds: readonly string[];
}

interface GraphViewportState {
  readonly zoom: number;
  readonly min: number;
  readonly max: number;
}

interface TopologyFit {
  readonly measurement: GraphViewMeasurement;
  readonly signature: string;
}
