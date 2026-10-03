import { describe, expect, it, render } from '@artiphishle/testosterone';
import { ZoraProvider } from '@zora/ZoraProvider';
import type { GraphViewController, GraphViewFitOptions } from '@zora/graph-view';
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
  it('adapts cycle spacing only from settled complete-cycle measurements', async () => {
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
      expect(fits).toEqual([]);
      expect(spacingChanges).toEqual([]);

      await click('#settled');
      expect(fits).toEqual([{ optimizeSpacing: true }]);
      expect(spacingChanges).toEqual([0.4]);
      expect(host.container.querySelector('#spacing')?.textContent).toBe('0.4');

      await click('#settled');
      expect(fits).toEqual([{ optimizeSpacing: true }, undefined]);

      await click('#settled');
      expect(fits).toEqual([{ optimizeSpacing: true }, undefined]);

      await click('#disable');
      await click('#settled');
      expect(fits).toEqual([{ optimizeSpacing: true }, undefined]);
    } finally {
      await act(async () => root.unmount());
      host.unmount();
    }
  });

  it('keeps normal layout completion passive and explicit Fit canonical', async () => {
    const state = { zoom: 1, min: 0.5, max: 8 };
    const fits: (GraphViewFitOptions | undefined)[] = [];
    const controller: GraphViewController = {
      fit: options => fits.push(options),
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
          <button id="settled" onClick={() => viewport.handleLayoutComplete(controller, [])}>
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
      await click('#settled');
      await click('#settled');
      expect(fits).toEqual([]);

      state.zoom = 5;
      await click('#zoom-event');
      expect(slider().value).toBe('5');

      state.max = 3;
      state.zoom = 1;
      await click('#settled');
      expect(slider().max).toBe('3');
      expect(slider().value).toBe('1');
      expect(fits).toEqual([]);

      await click('button[aria-label="Fit graph and optimize spacing for readability"]');
      expect(fits).toEqual([{ optimizeSpacing: true }]);
    } finally {
      await act(async () => root.unmount());
      host.unmount();
    }
  });
});
