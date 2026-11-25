import { describe, expect, it, render } from '@artiphishle/testosterone';
import { ZoraProvider } from '@ankhorage/zora/web/runtime';
import type { GraphViewController, GraphViewFitOptions } from '@ankhorage/zora/web/graph-view';
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { GraphZoomControls } from '@/features/graph-view/adapters/inbound/react/GraphZoomControls';
import { useGraphViewport } from '@/features/graph-view/adapters/inbound/react/useGraphViewport';
import type { CycleHighlight } from '@/types/auditVisualization';

const ACTIVE_CYCLE: readonly CycleHighlight[] = [
  {
    id: 'cycle-a',
    color: 'red',
    cycle: { packages: ['a', 'b', 'a'], edges: [] },
  },
];

describe('[graph viewport controls]', () => {
  it('fits cycle evidence without changing the selected layout spacing', async () => {
    const state = { zoom: 1, min: 0.5, max: 8 };
    const fits: (GraphViewFitOptions | undefined)[] = [];
    const spacingChanges: number[] = [];
    const measuredNodes = [
      { id: 'a', position: { x: 150, y: 130 }, size: { width: 18, height: 18 } },
      { id: 'b', position: { x: 1050, y: 670 }, size: { width: 18, height: 18 } },
    ];
    const controller: GraphViewController = {
      fit: options => fits.push(options),
      measureNodes: nodeIds => ({
        viewport: { width: 1200, height: 800 },
        nodes: measuredNodes.filter(node => nodeIds.includes(node.id)),
      }),
      getViewport: () => ({ zoom: state.zoom, pan: { x: 0, y: 0 } }),
      getZoomRange: () => ({ min: state.min, max: state.max }),
      setPan: () => {},
      setZoom: zoom => {
        state.zoom = zoom;
      },
      zoomBy: factor => {
        state.zoom *= factor;
      },
    };
    const host = render(<div />);
    const root = createRoot(host.container);

    function Harness() {
      const [enabled, setEnabled] = useState(true);
      const [spacingFactor, setSpacingFactor] = useState(0.8);
      const viewport = useGraphViewport({
        cycleHighlights: enabled ? ACTIVE_CYCLE : [],
        onSpacingFactorChange: nextSpacing => {
          spacingChanges.push(nextSpacing);
          setSpacingFactor(nextSpacing);
        },
        spacingFactor,
      });
      return (
        <>
          <button id="ready" onClick={() => viewport.handleReady(controller)}>
            Ready
          </button>
          <button id="incomplete" onClick={() => viewport.handleLayoutComplete(controller, ['a'])}>
            Incomplete
          </button>
          <button
            id="settled"
            onClick={() => viewport.handleLayoutComplete(controller, ['a', 'b'])}
          >
            Settled
          </button>
          <button id="disable" onClick={() => setEnabled(false)}>
            Disable
          </button>
          <output id="spacing">{spacingFactor}</output>
        </>
      );
    }

    const click = async (selector: string) => {
      await act(async () => host.container.querySelector<HTMLButtonElement>(selector)!.click());
    };

    try {
      await act(async () =>
        root.render(
          <ZoraProvider mode="light">
            <Harness />
          </ZoraProvider>
        )
      );

      await click('#ready');
      await click('#incomplete');
      expect(fits).toEqual([undefined]);
      expect(spacingChanges).toEqual([]);

      await click('#settled');
      expect(fits).toEqual([undefined, undefined, undefined]);
      expect(spacingChanges).toEqual([]);
      expect(host.container.querySelector('#spacing')?.textContent).toBe('0.8');

      await click('#settled');
      expect(fits).toEqual([undefined, undefined, undefined]);

      await click('#settled');
      expect(fits).toEqual([undefined, undefined, undefined]);

      await click('#disable');
      await click('#settled');
      expect(fits).toEqual([undefined, undefined, undefined]);
    } finally {
      await act(async () => root.unmount());
      host.unmount();
    }
  });

  it('waits for measured visible nodes and preserves navigation across duplicate readiness', async () => {
    const state = { zoom: 1, min: 0.5, max: 8 };
    const fits: (GraphViewFitOptions | undefined)[] = [];
    const controller: GraphViewController = {
      fit: options => fits.push(options),
      measureNodes: nodeIds => ({
        viewport: { width: 1200, height: 800 },
        nodes: nodeIds.map(id => ({
          id,
          position: { x: 600, y: 400 },
          size: { width: 48, height: 24 },
        })),
      }),
      getViewport: () => ({ zoom: state.zoom, pan: { x: 0, y: 0 } }),
      getZoomRange: () => ({ min: state.min, max: state.max }),
      setPan: () => {},
      setZoom: zoom => {
        state.zoom = zoom;
      },
      zoomBy: factor => {
        state.zoom *= factor;
      },
    };
    const host = render(<div />);
    const root = createRoot(host.container);

    function Harness() {
      const viewport = useGraphViewport({
        cycleHighlights: [],
        onSpacingFactorChange: () => undefined,
        spacingFactor: 1,
      });
      return (
        <>
          <button id="ready" onClick={() => viewport.handleReady(controller)}>
            Ready
          </button>
          <button id="empty" onClick={() => viewport.handleLayoutComplete(controller, [])}>
            Empty
          </button>
          <button id="settled" onClick={() => viewport.handleLayoutComplete(controller, ['a'])}>
            Settled
          </button>
          <button id="zoom-event" onClick={viewport.handleViewportChange}>
            Viewport
          </button>
          <GraphZoomControls
            controller={viewport.controller}
            maxZoom={viewport.max}
            minZoom={viewport.min}
            onFit={viewport.fitGraph}
            zoom={viewport.zoom}
          />
        </>
      );
    }

    const click = async (selector: string) => {
      await act(async () => host.container.querySelector<HTMLButtonElement>(selector)!.click());
    };
    const slider = () => host.container.querySelector<HTMLInputElement>('input[type="range"]')!;

    try {
      await act(async () =>
        root.render(
          <ZoraProvider mode="light">
            <Harness />
          </ZoraProvider>
        )
      );
      await click('#ready');
      await click('#empty');
      expect(fits).toEqual([]);
      await click('#settled');
      await click('#settled');
      expect(fits).toEqual([undefined]);

      state.zoom = 5;
      await click('#zoom-event');
      expect(slider().value).toBe('5');

      await click('#ready');
      await click('#settled');
      expect(fits).toEqual([undefined]);

      state.max = 3;
      state.zoom = 1;
      await click('#settled');
      expect(slider().max).toBe('3');
      expect(slider().value).toBe('1');
      expect(fits).toEqual([undefined]);

      await click('button[aria-label="Fit graph and optimize spacing for readability"]');
      expect(fits).toEqual([undefined, { optimizeSpacing: true }]);
    } finally {
      await act(async () => root.unmount());
      host.unmount();
    }
  });

  it('refits once when the visible topology grows or shrinks', async () => {
    const fits: (GraphViewFitOptions | undefined)[] = [];
    const positions = new Map([
      ['a', { x: 600, y: 400 }],
      ['b', { x: 600, y: 400 }],
      ['c', { x: 600, y: 400 }],
    ]);
    const controller: GraphViewController = {
      fit: options => fits.push(options),
      measureNodes: nodeIds => ({
        viewport: { width: 1200, height: 800 },
        nodes: nodeIds.map(id => ({
          id,
          position: positions.get(id)!,
          size: { width: 48, height: 24 },
        })),
      }),
      getViewport: () => ({ zoom: 1, pan: { x: 0, y: 0 } }),
      getZoomRange: () => ({ min: 0.5, max: 8 }),
      setPan: () => {},
      setZoom: () => {},
      zoomBy: () => {},
    };
    const host = render(<div />);
    const root = createRoot(host.container);

    function Harness() {
      const viewport = useGraphViewport({
        cycleHighlights: [],
        onSpacingFactorChange: () => undefined,
        spacingFactor: 1,
      });
      return (
        <>
          <button id="ready" onClick={() => viewport.handleReady(controller)}>
            Ready
          </button>
          <button id="two" onClick={() => viewport.handleLayoutComplete(controller, ['a', 'b'])}>
            Two
          </button>
          <button
            id="three"
            onClick={() => viewport.handleLayoutComplete(controller, ['a', 'b', 'c'])}
          >
            Three
          </button>
          <button id="one" onClick={() => viewport.handleLayoutComplete(controller, ['a'])}>
            One
          </button>
        </>
      );
    }

    const click = async (selector: string) => {
      await act(async () => host.container.querySelector<HTMLButtonElement>(selector)!.click());
    };

    try {
      await act(async () =>
        root.render(
          <ZoraProvider mode="light">
            <Harness />
          </ZoraProvider>
        )
      );
      await click('#ready');
      await click('#two');
      await click('#two');
      await click('#three');
      await click('#one');
      positions.set('a', { x: 1400, y: 400 });
      await click('#one');
      expect(fits).toEqual([undefined, undefined, undefined, undefined]);
    } finally {
      await act(async () => root.unmount());
      host.unmount();
    }
  });
});
