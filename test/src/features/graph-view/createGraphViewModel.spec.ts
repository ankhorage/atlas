import { describe, expect, it } from '@artiphishle/testosterone';
import type { ElementsDefinition } from 'cytoscape';

import { createGraphViewModel } from '@/features/graph-view/adapters/inbound/react/createGraphViewModel';

describe('[createGraphViewModel]', () => {
  it('resolves labels without overriding owner-measured label geometry', () => {
    const elements = {
      nodes: [
        { data: { id: 'a', name: 'name', label: 'relative.a' } },
        { data: { id: 'b', name: 'name-b' } },
        { data: { id: 'c' } },
      ],
      edges: [],
    };
    const model = createGraphViewModel(elements, elements, []);
    expect(model.nodes.map(node => node.label)).toEqual(['relative.a', 'name-b', 'c']);
    expect(model.nodes.every(node => node.data?.labelWidth === undefined)).toBe(true);
  });

  it('recognizes hidden descendants and missing intermediate packages without prefix collisions', () => {
    const allElements = {
      nodes: ['a.b.deep.leaf', 'a.bc', 'x.y'].map(id => ({ data: { id } })),
      edges: [],
    };
    const visibleElements = {
      nodes: ['a', 'a.b', 'a.bc', 'x', 'x.y', 'missing'].map(id => ({ data: { id } })),
      edges: [],
    };

    const model = createGraphViewModel(allElements, visibleElements, []);

    expect([...model.parentNodeIds]).toEqual(['a', 'a.b', 'x']);
    expect(model.nodes.map(node => node.classes)).toEqual([
      'isParent',
      'isParent',
      '',
      'isParent',
      '',
      '',
    ]);
  });

  it('preserves last-cycle precedence, first edge step, direction and input data', () => {
    const elements = {
      nodes: ['a', 'b', 'c'].map(id => ({ data: { id }, classes: ['isVendor'] })),
      edges: [
        { data: { id: 'ab', source: 'a', target: 'b', weight: 7 } },
        { data: { id: 'ba', source: 'b', target: 'a', weight: 2 } },
      ],
    };
    const before = structuredClone(elements);
    const model = createGraphViewModel(elements, elements, [
      {
        id: 'first',
        color: 'red',
        cycle: { packages: ['a', 'b'], edges: [{ from: 'a', to: 'b', via: [] }] },
      },
      {
        id: 'last',
        color: 'blue',
        cycle: {
          packages: ['a'],
          edges: [
            { from: 'b', to: 'c', via: [] },
            { from: 'a', to: 'b', via: [] },
            { from: 'a', to: 'b', via: [] },
          ],
        },
      },
    ]);

    expect(model.nodes.map(node => node.data?.auditCycleColor)).toEqual(['blue', 'red', undefined]);
    expect(model.nodes[0]?.classes).toBe('isVendor auditCycle');
    expect(model.edges[0]?.data?.auditCycleColor).toBe('blue');
    expect(model.edges[0]?.data?.auditCycleStep).toBe('2');
    expect(model.edges[0]?.data?.weight).toBe(7);
    expect(model.edges[1]?.classes).toBe('');
    expect(elements).toEqual(before);
  });

  it('keeps unrelated graph elements visually neutral while a cycle overlay is active', () => {
    const elements = {
      nodes: ['a', 'b', 'neutral'].map(id => ({ data: { id } })),
      edges: [
        { data: { id: 'ab', source: 'a', target: 'b' } },
        { data: { id: 'neutral-edge', source: 'b', target: 'neutral' } },
      ],
    };

    const model = createGraphViewModel(elements, elements, [
      {
        id: 'cycle',
        color: 'red',
        cycle: {
          packages: ['a', 'b', 'a'],
          edges: [{ from: 'a', to: 'b', via: [] }],
        },
      },
    ]);

    expect(model.nodes.find(node => node.id === 'neutral')).toMatchObject({
      classes: '',
      data: { id: 'neutral' },
    });
    expect(model.edges.find(edge => edge.id === 'neutral-edge')).toMatchObject({
      classes: '',
      data: { id: 'neutral-edge', source: 'b', target: 'neutral' },
    });
  });

  it('detaches only descendants whose dependency edge would overlap a compound ancestor', () => {
    const elements: ElementsDefinition = {
      nodes: [
        { data: { id: 'parent', name: 'parent' } },
        { data: { id: 'parent.child', name: 'child', parent: 'parent' } },
        { data: { id: 'parent.sibling', name: 'sibling', parent: 'parent' } },
      ],
      edges: [
        {
          data: {
            id: 'parent->parent.child',
            source: 'parent',
            target: 'parent.child',
            weight: 1,
          },
        },
      ],
    };

    const model = createGraphViewModel(elements, elements, []);
    const child = model.nodes.find(node => node.id === 'parent.child');
    const sibling = model.nodes.find(node => node.id === 'parent.sibling');

    expect(child?.parentId).toBeUndefined();
    expect(child?.data?.parent).toBeUndefined();
    expect(sibling?.parentId).toBe('parent');
    expect(model.edges.map(edge => edge.id)).toEqual(['parent->parent.child']);
  });

  it('drops parent references that point outside the visible projection', () => {
    const allElements: ElementsDefinition = {
      nodes: [
        { data: { id: 'parent', name: 'parent' } },
        { data: { id: 'parent.child', name: 'child', parent: 'parent' } },
      ],
      edges: [],
    };
    const visibleElements: ElementsDefinition = {
      nodes: [{ data: { id: 'parent.child', name: 'child', parent: 'parent' } }],
      edges: [],
    };

    const model = createGraphViewModel(allElements, visibleElements, []);

    expect(model.nodes[0]?.parentId).toBeUndefined();
    expect(model.nodes[0]?.data?.parent).toBeUndefined();
  });
});
