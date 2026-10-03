/***
 * Benchmarks synthetic graph projection and presentation CPU work, not browser rendering or layout.
 * @performance
 * Keep fixture size, warmups and sample counts comparable when updating the README evidence.
 */
import { createGraphViewModel } from '@/features/graph-view/adapters/inbound/react/createGraphViewModel';
import { projectVisibleGraph } from '@/features/graph-view/utils/projectVisibleGraph';

const leaves = Array.from({ length: 5000 }, (_, index) => ({
  data: { id: `root.group${Math.floor(index / 20)}.package${index}`, name: `package${index}` },
}));
const nodes = [
  { data: { id: 'root', name: 'root' } },
  ...Array.from({ length: 250 }, (_, index) => ({
    data: { id: `root.group${index}`, name: `group${index}` },
  })),
  ...leaves,
];
const edges = leaves.flatMap((node, index) =>
  [1, 7, 19].map(offset => ({
    data: {
      id: `${index}-${offset}`,
      source: node.data.id,
      target: leaves[(index + offset) % leaves.length].data.id,
      weight: 1,
    },
  }))
);
const elements = { nodes, edges };
const highlights = Array.from({ length: 50 }, (_, index) => ({
  id: String(index),
  color: '#ff0000',
  cycle: {
    packages: nodes.slice(index * 20, index * 20 + 20).map(node => node.data.id),
    edges: edges
      .slice(index * 20, index * 20 + 20)
      .map(edge => ({ from: edge.data.source, to: edge.data.target, via: [] })),
  },
}));
const measure = (name: string, run: () => unknown) => {
  for (const _ of Array.from({ length: 3 })) run();
  const samples = Array.from({ length: 9 }, () => {
    const start = performance.now();
    run();
    return performance.now() - start;
  }).sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      name,
      nodes: nodes.length,
      edges: edges.length,
      medianMs: samples[4],
      minMs: samples[0],
      maxMs: samples[8],
    })
  );
};
measure('model/no-highlights', () => createGraphViewModel(elements, elements, []));
measure('model/50-highlights', () => createGraphViewModel(elements, elements, highlights));
measure('projection', () =>
  projectVisibleGraph({
    elements,
    currentPackage: '',
    showCompoundNodes: false,
    showVendorPackages: true,
    subPackageDepth: 2,
  })
);
