import type { GraphViewController } from '@zora/graph-view';
import { type Dispatch, type SetStateAction, useCallback, useRef, useState } from 'react';

/***
 * Mirrors owner viewport state without changing graph framing after layout or node movement.
 * @performance Layout completion only refreshes cached bounds. Optimized fit remains behind
 * intentional actions: the explicit Fit control or one cycle-focus request after evidence is visible.
 */
export function useGraphViewport() {
  const [controller, setController] = useState<GraphViewController | null>(null);
  const controllerRef = useRef<GraphViewController | null>(null);
  const handledCycleFocusRef = useRef<string | null>(null);
  const pendingCycleFocusRef = useRef<string | null>(null);
  const [viewport, setViewport] = useState({ zoom: 1, min: 0.5, max: 2 });

  /*** Queues or applies one active-cycle focus without exposing cycle-only fitting. */
  const requestCycleFocus = useCallback(
    (signature: string | null) => {
      if (signature === null) {
        pendingCycleFocusRef.current = null;
        handledCycleFocusRef.current = null;
        return;
      }
      if (handledCycleFocusRef.current === signature) return;

      pendingCycleFocusRef.current = signature;
      const nextController = controllerRef.current;
      if (nextController === null) return;

      pendingCycleFocusRef.current = null;
      handledCycleFocusRef.current = signature;
      fitGraphWithOptimizedSpacing(nextController, setViewport);
    },
    [setViewport]
  );

  /*** Captures the controller before synchronizing the initial viewport and pending cycle focus. */
  const handleReady = (nextController: GraphViewController) => {
    controllerRef.current = nextController;
    setController(nextController);
    synchronizeGraphViewport(nextController, setViewport);
    requestCycleFocus(pendingCycleFocusRef.current);
  };

  /*** Reads the controller synchronously, including events before React commits readiness. */
  const handleViewportChange = () => {
    if (controllerRef.current !== null)
      synchronizeGraphViewport(controllerRef.current, setViewport);
  };

  /*** Refreshes settled owner bounds without fitting or changing manually positioned nodes. */
  const handleLayoutComplete = (nextController: GraphViewController) => {
    synchronizeGraphViewport(nextController, setViewport);
  };

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
    handleViewportChange,
    requestCycleFocus,
    ...viewport,
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

interface GraphViewportState {
  readonly zoom: number;
  readonly min: number;
  readonly max: number;
}
