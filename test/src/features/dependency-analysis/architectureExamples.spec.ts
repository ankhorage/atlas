import { describe, expect, it, resolve } from '@artiphishle/testosterone';

import { readProjectSnapshotAsync } from '@/features/project-analysis/composition/readProjectSnapshotAsync';

describe('[architecture examples]', () => {
  it('keeps the Java showcase analyzable across its hexagonal boundaries', async () => {
    const { packageGraph } = await readProjectSnapshotAsync(
      resolve(process.cwd(), 'examples/java/architecture-showcase')
    );
    const edges = new Set(packageGraph.edges.map(edge => `${edge.source}->${edge.target}`));

    expect(edges.has('io.atlas.showcase.orders.application->io.atlas.showcase.orders.domain')).toBe(
      true
    );
    expect(
      edges.has('io.atlas.showcase.orders.adapter.out->io.atlas.showcase.orders.application.port')
    ).toBe(true);
    expect(
      packageGraph.nodes.some(node => node.id === 'io.atlas.showcase.orders.composition')
    ).toBe(true);
  });

  it('keeps the TypeScript showcase analyzable across its hexagonal boundaries', async () => {
    const { packageGraph } = await readProjectSnapshotAsync(
      resolve(process.cwd(), 'examples/typescript/architecture-showcase')
    );
    const edges = new Set(packageGraph.edges.map(edge => `${edge.source}->${edge.target}`));

    expect(edges.has('src.orders.application->src.orders.domain')).toBe(true);
    expect(edges.has('src.orders.composition->src.orders.adapters.out')).toBe(true);
    expect(packageGraph.nodes.some(node => node.id === 'src.adapters.in')).toBe(true);
  });
});
