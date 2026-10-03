import { describe, expect, it, render } from '@artiphishle/testosterone';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import { useGraphInteractions } from '@/features/graph-view/adapters/inbound/react/useGraphInteractions';

describe('[useGraphInteractions]', () => {
  it(
    'keeps hover local while rendering controlled visible selection without hushing hidden selection',
    () => {
      const nodes = [{ id: 'p' }, { id: 'a', parentId: 'p' }, { id: 'b' }];
      const edges = [{ id: 'ab', source: 'a', target: 'b' }];
      const host = render(<div />);
      const root = createRoot(host.container);

      function Harness({
        visibleNodes,
        selectedNodeId,
      }: {
        visibleNodes: typeof nodes;
        selectedNodeId: string | null;
      }) {
        const interaction = useGraphInteractions(visibleNodes, edges, selectedNodeId);
        return (
          <>
            <output>
              {interaction.nodes.map((node) => `${node.id}:${node.classes ?? ''}`).join('|')}
            </output>
            <button onClick={() => interaction.handleNodeEvent({ id: 'b', type: 'pointer-enter' })}>
              enter
            </button>
            <button onClick={() => interaction.handleNodeEvent({ id: 'b', type: 'pointer-leave' })}>
              leave
            </button>
          </>
        );
      }

      const show = (visibleNodes: typeof nodes, selectedNodeId: string | null) =>
        flushSync(() =>
          root.render(<Harness visibleNodes={visibleNodes} selectedNodeId={selectedNodeId} />),
        );
      const click = (label: string) =>
        flushSync(() => {
          const button = Array.from(host.container.querySelectorAll('button')).find(
            (node) => node.textContent === label,
          );
          if (!button) throw new Error(`Missing ${label} button`);
          button.click();
        });
      const output = () => host.container.querySelector('output')?.textContent;
      try {
        show(nodes, 'a');
        expect(output()).toBe('p:hushed|a:highlight|b:highlight-outgoer');
        click('enter');
        expect(output()).toBe('p:hushed|a:highlight-incomer|b:highlight');
        click('leave');
        expect(output()).toBe('p:hushed|a:highlight|b:highlight-outgoer');

        show(nodes, 'p');
        expect(output()).toBe('p:highlight|a:hushed|b:hushed');

        show([{ id: 'b' }], 'a');
        expect(output()).toBe('b:');
        show(nodes, 'a');
        expect(output()).toBe('p:hushed|a:highlight|b:highlight-outgoer');
      } finally {
        flushSync(() => root.unmount());
        host.unmount();
      }
    },
  );
});
