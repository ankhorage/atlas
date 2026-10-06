import { resolve } from 'node:path';

import { assert, describe, it } from '@artiphishle/testosterone';

import { requestDependencyGraphAsync } from '@/features/dependency-analysis/adapters/outbound/api/requestDependencyGraphAsync';

describe('[requestDependencyGraphAsync]', () => {
  it('consumes the canonical action result through the local API runtime', async () => {
    const graph = await requestDependencyGraphAsync(resolve('examples/java/my-app'));

    assert.equal(graph.nodes.length > 0, true);
    assert.equal(graph.edges.length > 0, true);
  });
});
