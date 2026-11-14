'use client';

import { GraphView, type GraphViewNode } from '@ankhorage/zora/web/graph-view';

import { useGraphViewport } from '@/features/graph-view/adapters/inbound/react/useGraphViewport';

/*** Exercises the production initial-fit owner with a fixed number of repository graph nodes. */
export function ViewportAcceptanceGraph({ repositoryCount }: ViewportAcceptanceGraphProps) {
  const viewport = useGraphViewport({
    cycleHighlights: [],
    onSpacingFactorChange: () => undefined,
    spacingFactor: 1,
  });
  const nodes = createRepositoryNodes(repositoryCount);
  const nodeIds = nodes.map(node => node.id);

  return (
    <main style={{ height: '100vh', width: '100vw' }}>
      <GraphView
        ariaLabel="Graph"
        edges={createRepositoryEdges(nodes)}
        layout="grid"
        maxZoom={2}
        minZoom={0.5}
        nodes={nodes}
        sizeNodesToLabels
        zoomMode="fit-relative"
        onLayoutComplete={controller => viewport.handleLayoutComplete(controller, nodeIds)}
        onReady={viewport.handleReady}
        onViewportChange={viewport.handleViewportChange}
      />
    </main>
  );
}

/*** Creates one stable visible node per repository without involving the workspace loading policy. */
function createRepositoryNodes(repositoryCount: number): readonly GraphViewNode[] {
  return Array.from({ length: repositoryCount }, (_, index) => ({
    id: `repository-${index}`,
    label: `repository-${index}`,
  }));
}

/*** Keeps the synthetic repository graph connected so its whole-graph fit owns the visible extent. */
function createRepositoryEdges(nodes: readonly GraphViewNode[]) {
  return nodes.slice(1).map((node, index) => ({
    source: nodes[index].id,
    target: node.id,
  }));
}

interface ViewportAcceptanceGraphProps {
  readonly repositoryCount: number;
}
