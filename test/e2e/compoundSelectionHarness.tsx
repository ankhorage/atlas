import {
  GraphView,
  type GraphViewController,
  type GraphViewEdge,
  type GraphViewNode,
} from '@zora/graph-view';
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { applyGraphInteractionPresentation } from '@/features/graph-view/adapters/inbound/react/applyGraphInteractionPresentation';

const NODES: readonly GraphViewNode[] = [
  { id: 'src', label: 'src' },
  { id: 'src.features', label: 'features', parentId: 'src' },
  { id: 'src.features.nested', label: 'nested', parentId: 'src.features' },
  { id: 'src.features.nested.feature', label: 'feature', parentId: 'src.features.nested' },
  { id: 'src.consumer', label: 'consumer', parentId: 'src' },
  { id: 'src.external', label: 'external', parentId: 'src' },
];

const EDGES: readonly GraphViewEdge[] = [
  { id: 'inner-compound', source: 'src.features', target: 'src.features.nested' },
  {
    id: 'inner-descendant',
    source: 'src.features.nested',
    target: 'src.features.nested.feature',
  },
  { id: 'incoming', source: 'src.consumer', target: 'src.features.nested.feature' },
  { id: 'outgoing', source: 'src.features.nested.feature', target: 'src.external' },
];

const PARENTS = new Map(
  NODES.flatMap(node => (node.parentId === undefined ? [] : [[node.id, node.parentId] as const]))
);

const LIGHT_STYLE = { background: '#ffffff', color: '#111827' } as const;
const DARK_STYLE = { background: '#111827', color: '#f9fafb' } as const;

/*** Mounts a test-owned GraphView acceptance surface using only the published controller contract. */
function CompoundSelectionHarness() {
  const [controller, setController] = useState<GraphViewController | null>(null);
  const [currentPackage, setCurrentPackage] = useState('src');
  const [selectedNodeIds, setSelectedNodeIds] = useState<readonly string[]>([]);
  const [showCompoundNodes, setShowCompoundNodes] = useState(false);
  const [dark, setDark] = useState(false);
  const [measurement, setMeasurement] = useState('null');
  const [viewport, setViewport] = useState('');
  const visibleNodes = useMemo(
    () => (showCompoundNodes ? NODES : NODES.filter(node => node.parentId === undefined)),
    [showCompoundNodes]
  );
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map(node => node.id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () => EDGES.filter(edge => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)),
    [visibleNodeIds]
  );
  const presentation = useMemo(
    () =>
      applyGraphInteractionPresentation(
        visibleNodes,
        visibleEdges,
        { hoveredNodeId: null, selectedNodeIds },
        PARENTS
      ),
    [selectedNodeIds, visibleEdges, visibleNodes]
  );
  useEffect(() => {
    if (controller === null) return;
    setViewport(JSON.stringify(controller.getViewport()));
  }, [controller, selectedNodeIds, showCompoundNodes]);

  return (
    <main style={{ ...LIGHT_STYLE, ...(dark ? DARK_STYLE : {}), height: '100vh' }}>
      <output aria-label="Breadcrumbs">
        {['Home', ...currentPackage.split('.').filter(Boolean)].join(' › ')}
      </output>
      <button
        aria-pressed={showCompoundNodes}
        role="switch"
        type="button"
        onClick={() => setShowCompoundNodes(value => !value)}
      >
        Show Compound Nodes
      </button>
      <button type="button" onClick={() => setDark(value => !value)}>
        {dark ? 'Light' : 'Dark'}
      </button>
      <div role="tree" aria-label="Project tree">
        {NODES.filter(node => node.id === 'src.features').map(node => (
          <div key={node.id} aria-selected={selectedNodeIds.includes(node.id)} role="treeitem">
            {node.label}
          </div>
        ))}
      </div>
      <GraphView
        ariaLabel="Graph"
        edges={presentation.edges}
        layout="breadthfirst"
        nodes={presentation.nodes}
        selectedNodeIds={selectedNodeIds}
        style={{ height: 640, width: 960 }}
        styleRules={[
          {
            selector: 'node',
            style: { 'background-color': dark ? '#f9fafb' : '#111827', label: 'data(label)' },
          },
          { selector: '.highlight', style: { opacity: 1 } },
          { selector: '.hushed', style: { opacity: 0.15 } },
          { selector: '.highlight-incomer', style: { 'line-color': '#2563eb', opacity: 1 } },
          { selector: '.highlight-outgoer', style: { 'line-color': '#dc2626', opacity: 1 } },
        ]}
        onNodeEvent={event => {
          if (event.type === 'press' && event.selectionIntent !== undefined) {
            setSelectedNodeIds(previous =>
              event.selectionIntent === 'toggle'
                ? previous.includes(event.id)
                  ? previous.filter(id => id !== event.id)
                  : [...previous, event.id]
                : previous.length === 1 && previous[0] === event.id
                  ? []
                  : [event.id]
            );
          }
          if (event.type === 'double-press' && event.id === 'src') setCurrentPackage('src');
        }}
        onLayoutComplete={nextController => {
          const nextMeasurement = readMeasurement(nextController);
          setMeasurement(previous => (previous === nextMeasurement ? previous : nextMeasurement));
        }}
        onReady={nextController => {
          setController(nextController);
          setMeasurement(readMeasurement(nextController));
        }}
        onViewportChange={nextViewport => setViewport(JSON.stringify(nextViewport))}
      />
      <output aria-label="Graph geometry">{measurement}</output>
      <output aria-label="Graph viewport">{viewport}</output>
      <output aria-label="Graph presentation">
        {JSON.stringify({
          nodes: presentation.nodes.map(node => [node.id, node.classes]),
          edges: presentation.edges.map(edge => [edge.id, edge.classes]),
        })}
      </output>
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<CompoundSelectionHarness />);

/*** Serializes only public GraphView geometry so the browser can target rendered canvas positions. */
function readMeasurement(controller: GraphViewController): string {
  return JSON.stringify(controller.measureNodes?.(['src', 'src.features']) ?? null);
}
