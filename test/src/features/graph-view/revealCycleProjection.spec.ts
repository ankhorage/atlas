import { describe, expect, it } from '@artiphishle/testosterone';
import type { ElementsDefinition } from 'cytoscape';

import { revealCycleProjection } from '@/features/graph-view/utils/revealCycleProjection';

describe('[cycle evidence reveal projection]', () => {
  it('temporarily restores only selected directed cycle evidence and required compound parents', () => {
    const result = revealCycleProjection(
      elements(),
      { nodes: [elements().nodes[0]], edges: [] },
      cycle
    );

    expect(result.nodes.map(node => node.data.id).sort()).toEqual(['a', 'a.child', 'b', 'root']);
    expect(result.edges.map(edge => `${edge.data.source}->${edge.data.target}`).sort()).toEqual([
      'a.child->b',
      'b->a.child',
    ]);
  });
});

const cycle = {
  packages: ['a.child', 'b', 'a.child'],
  edges: [
    { from: 'a.child', to: 'b', via: [] },
    { from: 'b', to: 'a.child', via: [] },
  ],
};

/*** Supplies a filtered graph where the selected evidence has been hidden by presentation state. */
function elements(): ElementsDefinition {
  return {
    nodes: [
      { data: { id: 'root' } },
      { data: { id: 'a', parent: 'root' } },
      { data: { id: 'a.child', parent: 'a' } },
      { data: { id: 'b' } },
      { data: { id: 'other' } },
    ],
    edges: [
      { data: { id: 'one', source: 'a.child', target: 'b' } },
      { data: { id: 'two', source: 'b', target: 'a.child' } },
      { data: { id: 'other', source: 'other', target: 'b' } },
    ],
  };
}
