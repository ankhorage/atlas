import { describe, expect, it } from '@artiphishle/testosterone';

import { applyGraphInteractionPresentation } from '@/features/graph-view/adapters/inbound/react/applyGraphInteractionPresentation';
import { reduceGraphInteraction } from '@/features/graph-view/domain/reduceGraphInteraction';
import type { GraphInteractionState } from '@/types/graphInteraction';

const nodes = ['a', 'b', 'c', 'd'].map(id => ({
  id,
  classes: 'isVendor',
  data: { labelWidth: 7 },
}));
const edges = [
  {
    id: 'ab',
    source: 'a',
    target: 'b',
    classes: 'auditCycle',
    data: { auditCycleStep: '1', weight: 7 },
  },
  { id: 'ca', source: 'c', target: 'a' },
  { id: 'bd', source: 'b', target: 'd' },
];
const initial: GraphInteractionState = { hoveredNodeId: null, selectedNodeIds: [] };

describe('[graph interactions]', () => {
  it('highlights direct directed dependencies and preserves prepared model and audit data', () => {
    const state = reduceGraphInteraction(initial, { id: 'a', type: 'pointer-enter' });
    const result = applyGraphInteractionPresentation(nodes, edges, state, new Map());
    expect(result.nodes.map(node => node.classes)).toEqual([
      'isVendor highlight',
      'isVendor highlight-outgoer',
      'isVendor highlight-incomer',
      'isVendor hushed',
    ]);
    expect(result.edges.map(edge => edge.classes)).toEqual([
      'auditCycle highlight-outgoer',
      'highlight-incomer',
      'hushed',
    ]);
    expect(result.edges[0]?.data).toBe(edges[0]?.data);
    expect(result.nodes[0]?.data).toBe(nodes[0]?.data);
    expect(nodes[0]?.classes).toBe('isVendor');
    expect(edges[0]?.classes).toBe('auditCycle');
  });

  it('restores selection on pointer exit and clears presentation on deselection', () => {
    const selected = reduceGraphInteraction(initial, { id: 'a', type: 'select' });
    const hovered = reduceGraphInteraction(selected, { id: 'd', type: 'pointer-enter' });
    expect(
      applyGraphInteractionPresentation(nodes, edges, hovered, new Map()).nodes[3]?.classes
    ).toBe('isVendor highlight');
    const restored = reduceGraphInteraction(hovered, { id: 'd', type: 'pointer-leave' });
    expect(applyGraphInteractionPresentation(nodes, edges, restored, new Map())).toEqual(
      applyGraphInteractionPresentation(nodes, edges, selected, new Map())
    );
    const cleared = reduceGraphInteraction(restored, { id: 'a', type: 'unselect' });
    const result = applyGraphInteractionPresentation(nodes, edges, cleared, new Map());
    expect(result.nodes).toBe(nodes);
    expect(result.edges).toBe(edges);
  });

  it('ignores a late leave from a different node and duplicate selection events', () => {
    const selected = reduceGraphInteraction(initial, { id: 'a', type: 'select' });
    expect(reduceGraphInteraction(selected, { id: 'a', type: 'select' })).toBe(selected);
    const hovered = reduceGraphInteraction(selected, { id: 'b', type: 'pointer-enter' });
    expect(reduceGraphInteraction(hovered, { id: 'a', type: 'pointer-leave' })).toBe(hovered);
    expect(reduceGraphInteraction(hovered, { id: 'c', type: 'unselect' })).toBe(hovered);
  });

  it('combines multiple selections and retains self-loops and parallel edges', () => {
    const selected = reduceGraphInteraction(
      reduceGraphInteraction(initial, { id: 'a', type: 'select' }),
      { id: 'b', type: 'select' }
    );
    const result = applyGraphInteractionPresentation(
      nodes,
      [
        { source: 'a', target: 'b' },
        { source: 'a', target: 'b' },
        { source: 'a', target: 'a' },
      ],
      selected,
      new Map()
    );
    expect(result.edges.map(edge => edge.classes)).toEqual([
      'highlight-outgoer highlight-incomer',
      'highlight-outgoer highlight-incomer',
      'highlight-outgoer highlight-incomer',
    ]);
  });

  it('keeps visible compound descendants and internal edges readable without selecting descendants', () => {
    const compoundNodes = ['group', 'child', 'nested', 'outgoing', 'incoming', 'unrelated'].map(
      id => ({ id })
    );
    const compoundEdges = [
      { source: 'group', target: 'child' },
      { source: 'child', target: 'nested' },
      { source: 'nested', target: 'outgoing' },
      { source: 'incoming', target: 'child' },
      { source: 'unrelated', target: 'outgoing' },
    ];
    const state = reduceGraphInteraction(initial, { id: 'group', type: 'select' });

    const result = applyGraphInteractionPresentation(
      compoundNodes,
      compoundEdges,
      state,
      new Map([
        ['child', 'group'],
        ['nested', 'child'],
      ])
    );

    expect(result.nodes.map(node => node.classes)).toEqual([
      'highlight',
      'highlight',
      'highlight',
      'highlight-outgoer',
      'highlight-incomer',
      'hushed',
    ]);
    expect(result.edges.map(edge => edge.classes)).toEqual([
      'highlight',
      'highlight',
      'highlight-outgoer',
      'highlight-incomer',
      'hushed',
    ]);
    expect(state.selectedNodeIds).toEqual(['group']);
  });

  it('keeps dependencies between separately selected compound scopes directional', () => {
    const compoundNodes = ['groupA', 'a', 'groupB', 'b'].map(id => ({ id }));
    const state = reduceGraphInteraction(
      reduceGraphInteraction(initial, { id: 'groupA', type: 'select' }),
      { id: 'groupB', type: 'select' }
    );

    const result = applyGraphInteractionPresentation(
      compoundNodes,
      [{ source: 'a', target: 'b' }],
      state,
      new Map([
        ['a', 'groupA'],
        ['b', 'groupB'],
      ])
    );

    expect(result.nodes.map(node => node.classes)).toEqual([
      'highlight',
      'highlight highlight-incomer',
      'highlight',
      'highlight highlight-outgoer',
    ]);
    expect(result.edges.map(edge => edge.classes)).toEqual(['highlight-outgoer highlight-incomer']);
  });

  it('keeps a selected compound dependency to an external selected leaf directional', () => {
    const compoundNodes = ['group', 'child', 'external'].map(id => ({ id }));
    const state = reduceGraphInteraction(
      reduceGraphInteraction(initial, { id: 'group', type: 'select' }),
      { id: 'external', type: 'select' }
    );

    const result = applyGraphInteractionPresentation(
      compoundNodes,
      [{ source: 'child', target: 'external' }],
      state,
      new Map([['child', 'group']])
    );

    expect(result.nodes.map(node => node.classes)).toEqual([
      'highlight',
      'highlight highlight-incomer',
      'highlight highlight-outgoer',
    ]);
    expect(result.edges.map(edge => edge.classes)).toEqual(['highlight-outgoer highlight-incomer']);
  });

  it('keeps an internal edge stable when its selected compound child is explicitly selected', () => {
    const compoundNodes = ['group', 'child', 'nested'].map(id => ({ id }));
    const state = reduceGraphInteraction(
      reduceGraphInteraction(initial, { id: 'group', type: 'select' }),
      { id: 'child', type: 'select' }
    );

    const result = applyGraphInteractionPresentation(
      compoundNodes,
      [{ source: 'child', target: 'nested' }],
      state,
      new Map([
        ['child', 'group'],
        ['nested', 'child'],
      ])
    );

    expect(result.edges.map(edge => edge.classes)).toEqual(['highlight']);
  });
});
