import { resolve } from 'node:path';

import { assert, describe, it } from '@artiphishle/testosterone';

import { POST } from '@/app/api/dependency-graph/route';

describe('[dependency-graph API route]', () => {
  it('binds the canonical action through the Next.js API adapter', async () => {
    const response = await POST(
      new Request('http://atlas.test/api/dependency-graph', {
        body: JSON.stringify({
          projects: [{ id: 'current', rootPath: resolve(process.cwd(), 'examples/java/my-app') }],
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
    );
    const graph: unknown = await response.json();

    assert.equal(response.status, 200);
    assert.equal(isDependencyGraph(graph), true);
    if (!isDependencyGraph(graph)) return;
    assert.equal(graph.nodes.length > 0, true);
  });
});

/*** Identify the canonical serializable dependency graph response without importing implementation APIs. */
function isDependencyGraph(
  value: unknown
): value is { readonly edges: readonly unknown[]; readonly nodes: readonly unknown[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'edges' in value &&
    Array.isArray(value.edges) &&
    'nodes' in value &&
    Array.isArray(value.nodes)
  );
}
