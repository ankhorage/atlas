'use client';

import { toCytoscapeElements } from '@ankhorage/graph-cytoscape';
import { GraphView, type GraphViewElementEvent, type GraphViewLayoutName } from '@zora/graph-view';
import { useZoraTheme, type ZoraRuntimeTheme } from '@zora/ZoraProvider';
import type { ElementsDefinition, LayoutOptions } from 'cytoscape';
import React, { useMemo } from 'react';

import { LAYOUTS } from '@/features/graph-view/adapters/inbound/cytoscape/constants';
import { createGraphViewModel } from '@/features/graph-view/adapters/inbound/react/createGraphViewModel';
import { createGraphViewStyles } from '@/features/graph-view/adapters/inbound/react/createGraphViewStyles';
import { GraphZoomControls } from '@/features/graph-view/adapters/inbound/react/GraphZoomControls';
import { useGraphFocus } from '@/features/graph-view/adapters/inbound/react/useGraphFocus';
import { useGraphInteractions } from '@/features/graph-view/adapters/inbound/react/useGraphInteractions';
import { useGraphProjection } from '@/features/graph-view/adapters/inbound/react/useGraphProjection';
import { useGraphViewport } from '@/features/graph-view/adapters/inbound/react/useGraphViewport';
import { useSettings } from '@/features/settings/adapters/inbound/react/useSettings';
import type { CycleHighlight } from '@/types/auditVisualization';
import type { PackageDependencyGraph } from '@/types/dependencyAnalysis';

const GRAPH_CANVAS_STYLE = {
  display: 'flex',
  flex: 1,
  flexDirection: 'column',
  gap: 8,
  minHeight: 0,
  minWidth: 0,
  overflow: 'hidden',
  paddingLeft: 32,
  paddingRight: 32,
} as const;

const GRAPH_VIEWPORT_STYLE = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
  position: 'relative',
} as const;

/*** Renders PKGViz graph policy through the materialized ZORA GraphView runtime. */
export function DependencyGraphView(props: DependencyGraphViewProps) {
  const settings = useSettings();
  const { theme } = useZoraTheme();
  const packageGraph = useMemo(
    () =>
      toCytoscapeElements(props.packageGraph, {
        nodeClasses: node => (node.data.isIntrinsic === true ? undefined : 'isVendor'),
      }),
    [props.packageGraph]
  );
  const visibleElements = useGraphProjection({
    currentPackage: props.currentPackage,
    elements: packageGraph,
    preservePackageScope: props.cycleHighlights.length > 0,
    setCurrentPackage: props.setCurrentPackage,
    setMaxSubPackageDepth: settings.setMaxSubPackageDepth,
    setSubPackageDepth: settings.setSubPackageDepth,
    showCompoundNodes: settings.showCompoundNodes,
    showVendorPackages: settings.showVendorPackages,
    subPackageDepth: settings.subPackageDepth,
  });

  useGraphFocus({
    cycleHighlights: props.cycleHighlights,
    currentPackage: props.currentPackage,
    setCurrentPackage: props.setCurrentPackage,
    setSubPackageDepth: settings.setSubPackageDepth,
    subPackageDepth: settings.subPackageDepth,
    visibleElements,
  });

  const presentation = useGraphViewPresentation({
    cycleHighlights: props.cycleHighlights,
    layout: settings.cytoscapeLayout,
    packageGraph,
    theme,
    visibleElements,
  });
  if (presentation.model === null) return null;

  return (
    <DependencyGraphCanvas
      {...props}
      layout={presentation.layout}
      layoutOptions={presentation.layoutOptions}
      model={presentation.model}
      onSpacingFactorChange={settings.setCytoscapeLayoutSpacing}
      spacingFactor={settings.cytoscapeLayoutSpacing}
      styles={presentation.styles}
      theme={theme}
    />
  );
}

/***
 * Memoizes GraphView model, style, and layout inputs from the active PKGViz projection.
 * @performance
 * Stable inputs avoid repeated projection work and let the owner distinguish presentation from
 * topology/layout changes. Do not recreate these objects on unrelated renders or add compensating
 * layout effects here. ZORA owns runtime reconciliation; memoization alone is not a correctness gate.
 */
function useGraphViewPresentation(input: GraphViewPresentationInput) {
  const model = useMemo(
    () =>
      input.visibleElements === null
        ? null
        : createGraphViewModel(input.packageGraph, input.visibleElements, input.cycleHighlights),
    [input.cycleHighlights, input.packageGraph, input.visibleElements]
  );
  const styles = useMemo(
    () =>
      input.visibleElements === null
        ? []
        : createGraphViewStyles(input.visibleElements, input.theme, input.layout),
    [input.layout, input.theme, input.visibleElements]
  );
  const layoutOptions = useMemo<Readonly<Record<string, unknown>>>(
    () => ({ ...LAYOUTS[input.layout] }),
    [input.layout]
  );

  return {
    layout: readGraphViewLayout(input.layout),
    layoutOptions,
    model,
    styles,
  };
}

/*** Owns GraphView controller callbacks and renders the viewport plus zoom controls. */
function DependencyGraphCanvas(props: DependencyGraphCanvasProps) {
  const viewport = useGraphViewport();
  const interactions = useGraphCanvasInteractions(props);

  return (
    <div style={GRAPH_CANVAS_STYLE}>
      <div style={GRAPH_VIEWPORT_STYLE}>
        <GraphView
          edges={interactions.edges}
          layout={props.layout}
          layoutOptions={props.layoutOptions}
          maxZoom={2}
          minZoom={0.5}
          minReadableLabelSize={24}
          maxFitLabelSize={24}
          nodes={interactions.nodes}
          selectedNodeIds={interactions.selectedNodeIds}
          zoomMode="fit-relative"
          sizeNodesToLabels
          onLayoutComplete={viewport.handleLayoutComplete}
          onNodeEvent={interactions.handleNodeEvent}
          onReady={viewport.handleReady}
          onViewportChange={viewport.handleViewportChange}
          onSpacingFactorChange={props.onSpacingFactorChange}
          spacingFactor={props.spacingFactor}
          style={{ background: props.theme.semantics.surface.default }}
          styleRules={props.styles}
        />
        {props.overlay}
      </div>
      <GraphZoomControls
        controller={viewport.controller}
        maxZoom={viewport.max}
        minZoom={viewport.min}
        onFit={viewport.fitGraph}
        zoom={viewport.zoom}
      />
    </div>
  );
}

/*** Compose local hover presentation with the workspace-owned controlled graph selection. */
function useGraphCanvasInteractions(props: DependencyGraphCanvasProps) {
  const interactions = useGraphInteractions(
    props.model.nodes,
    props.model.edges,
    props.selectedNodeId
  );
  return {
    ...interactions,
    selectedNodeIds: props.selectedNodeId === null ? [] : [props.selectedNodeId],
    handleNodeEvent: createGraphNodeEventHandler({
      handleInteraction: interactions.handleNodeEvent,
      onNodeSelect: props.onNodeSelect,
      onNodeUnselect: props.onNodeUnselect,
      parentNodeIds: props.model.parentNodeIds,
      setCurrentPackage: props.setCurrentPackage,
    }),
  };
}

/*** Create the graph event bridge without coupling selection changes to layout or viewport work. */
function createGraphNodeEventHandler(input: GraphNodeEventHandlerInput) {
  return (event: GraphViewElementEvent) => {
    input.handleInteraction(event);
    if (event.type === 'select') return input.onNodeSelect(event.id);
    if (event.type === 'unselect') return input.onNodeUnselect(event.id);
    if (event.type !== 'double-press' || !input.parentNodeIds.has(event.id)) return;
    input.setCurrentPackage(event.id);
  };
}

/*** Narrows persisted Cytoscape layout names to the layouts supported by ZORA GraphView. */
function readGraphViewLayout(layout: LayoutOptions['name']): GraphViewLayoutName {
  if (layout === 'breadthfirst') return 'breadthfirst';
  if (layout === 'circle') return 'circle';
  if (layout === 'elk') return 'elk';
  if (layout === 'grid') return 'grid';
  return 'concentric';
}

interface GraphNodeEventHandlerInput {
  readonly handleInteraction: (event: GraphViewElementEvent) => void;
  readonly onNodeSelect: (id: string) => void;
  readonly onNodeUnselect: (id: string) => void;
  readonly parentNodeIds: ReadonlySet<string>;
  readonly setCurrentPackage: (path: string) => void;
}

interface DependencyGraphViewProps {
  readonly currentPackage: string;
  readonly packageGraph: PackageDependencyGraph;
  readonly selectedNodeId: string | null;
  readonly setCurrentPackage: (path: string) => void;
  readonly onNodeSelect: (id: string) => void;
  readonly onNodeUnselect: (id: string) => void;
  readonly cycleHighlights: readonly CycleHighlight[];
  readonly overlay?: React.ReactNode;
}

interface GraphViewPresentationInput {
  readonly cycleHighlights: readonly CycleHighlight[];
  readonly layout: LayoutOptions['name'];
  readonly packageGraph: ElementsDefinition;
  readonly theme: ZoraRuntimeTheme;
  readonly visibleElements: ElementsDefinition | null;
}

interface DependencyGraphCanvasProps extends DependencyGraphViewProps {
  readonly onSpacingFactorChange: (spacingFactor: number) => void;
  readonly layout: GraphViewLayoutName;
  readonly layoutOptions: Readonly<Record<string, unknown>>;
  readonly model: NonNullable<ReturnType<typeof createGraphViewModel>>;
  readonly spacingFactor: number;
  readonly styles: ReturnType<typeof createGraphViewStyles>;
  readonly theme: ZoraRuntimeTheme;
}
