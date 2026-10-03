/*** Reduces layout spacing only when active-cycle nodes are both too small and too spread out. */
export function getAdaptiveCycleLayoutSpacing(
  currentSpacing: number,
  metrics: CycleLayoutMetrics
): number {
  const minViewport = Math.min(metrics.viewportWidth, metrics.viewportHeight);
  if (minViewport <= 0 || currentSpacing <= 0) return currentSpacing;

  const targetNodeSize = Math.min(44, Math.max(28, minViewport * 0.04));
  const targetNodeDistance = Math.min(260, Math.max(160, minViewport * 0.24));
  if (
    metrics.averageNodeSize >= targetNodeSize ||
    metrics.averageNodeDistance <= targetNodeDistance
  ) {
    return currentSpacing;
  }

  const cycleCoverage = Math.max(
    metrics.cycleWidth / metrics.viewportWidth,
    metrics.cycleHeight / metrics.viewportHeight
  );
  const nodeFactor = Math.min(1, Math.max(0.35, metrics.averageNodeSize / targetNodeSize));
  const distanceFactor = Math.min(
    1,
    Math.max(0.35, targetNodeDistance / metrics.averageNodeDistance)
  );
  const coverageFactor = Math.min(1, Math.max(0.65, 0.55 / Math.max(cycleCoverage, 0.01)));
  const compression = Math.cbrt(nodeFactor * distanceFactor * coverageFactor);
  const nextSpacing = Math.round(currentSpacing * compression * 10) / 10;

  return Math.max(0.2, Math.min(currentSpacing, nextSpacing));
}

interface CycleLayoutMetrics {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly cycleWidth: number;
  readonly cycleHeight: number;
  readonly averageNodeSize: number;
  readonly averageNodeDistance: number;
}
