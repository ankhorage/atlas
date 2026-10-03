import { describe, expect, it, render } from '@artiphishle/testosterone';
import { ZoraProvider } from '@zora/ZoraProvider';
import type { GraphViewController, GraphViewFitOptions } from '@zora/graph-view';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import { GraphZoomControls } from '@/features/graph-view/adapters/inbound/react/GraphZoomControls';
import { useGraphViewport } from '@/features/graph-view/adapters/inbound/react/useGraphViewport';

describe('[graph viewport controls]', () => {
  it('fits only for explicit Fit or one active-cycle focus request', async () => {
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
      const viewport = useGraphViewport();
      return (
        <>
          <button id="ready" onClick={() => viewport.handleReady(controller)}>
            Ready
          </button>
          <button id="settled" onClick={() => viewport.handleLayoutComplete(controller)}>
            Settled
          </button>
          <button id="zoom-event" onClick={viewport.handleViewportChange}>
            Viewport
          </button>
          <button id="cycle-focus" onClick={() => viewport.requestCycleFocus('cycle-a')}>
            Cycle focus
          </button>
          <button id="clear-cycle-focus" onClick={() => viewport.requestCycleFocus(null)}>
            Clear cycle focus
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
      await click('#cycle-focus');
      expect(fits).toEqual([]);
      await click('#ready');
      expect(fits).toEqual([{ optimizeSpacing: true }]);

      state.zoom = 5;
      await click('#zoom-event');
      expect(slider().value).toBe('5');

      state.max = 3;
      state.zoom = 1;
      await click('#settled');
      await click('#settled');
      expect(slider().max).toBe('3');
      expect(slider().value).toBe('1');
      expect(fits).toEqual([{ optimizeSpacing: true }]);

      await click('#cycle-focus');
      expect(fits).toEqual([{ optimizeSpacing: true }]);
      await click('#clear-cycle-focus');
      await click('#cycle-focus');
      expect(fits).toEqual([{ optimizeSpacing: true }, { optimizeSpacing: true }]);

      await click('button[aria-label="Fit graph and optimize spacing for readability"]');
      expect(fits).toEqual([
        { optimizeSpacing: true },
        { optimizeSpacing: true },
        { optimizeSpacing: true },
      ]);
    } finally {
      await act(async () => root.unmount());
      host.unmount();
    }
  });
});
