import { resolve } from 'node:path';

import { createDependencyGraphAsync } from '@ankhorage/dependency-graph';
import { assert, describe, it } from '@artiphishle/testosterone';

import { readProjectSnapshotAsync } from '@/features/project-analysis/composition/readProjectSnapshotAsync';
import { createWorkspaceSnapshot } from '@/features/workspace/application/use-cases/createWorkspaceSnapshot';
import { deserializeWorkspaceSnapshot } from '@/features/workspace/application/use-cases/deserializeWorkspaceSnapshot';
import { serializeWorkspaceSnapshot } from '@/features/workspace/application/use-cases/serializeWorkspaceSnapshot';
import { loadEmbeddedWorkspaceSnapshot } from '@/features/workspace/composition/loadEmbeddedWorkspaceSnapshot';
import { loadWorkspaceAsync } from '@/features/workspace/composition/loadWorkspaceAsync';

describe('[workspace snapshots]', () => {
  it('hydrates the live Java fixture and its embedded snapshot into the same graph, tree, and audit state', async () => {
    const projectPath = resolve('examples/java/my-app');
    const live = await loadWorkspaceAsync(projectPath, inspection =>
      createDependencyGraphAsync({ projects: [{ id: 'current', inspection }] })
    );
    const embedded = loadEmbeddedWorkspaceSnapshot(
      serializeWorkspaceSnapshot(
        createWorkspaceSnapshot(await readProjectSnapshotAsync(projectPath))
      )
    );

    assert.equal(live.ok, true);
    assert.equal(embedded.ok, true);
    if (!live.ok || !embedded.ok) return;
    assert.deepEqual(embedded.value, live.value);
  });

  it('round-trips a valid snapshot through the portable serialization boundary', async () => {
    const snapshot = createWorkspaceSnapshot(
      await readProjectSnapshotAsync(resolve('examples/java/my-app'))
    );

    assert.deepEqual(deserializeWorkspaceSnapshot(serializeWorkspaceSnapshot(snapshot)), snapshot);
  });

  it('keeps snapshot version and schema errors explicit in persistent workspace state', () => {
    assert.deepEqual(loadEmbeddedWorkspaceSnapshot('{"version":2}'), {
      ok: false,
      error: 'Unsupported Atlas workspace snapshot version: 2.',
    });
    assert.deepEqual(loadEmbeddedWorkspaceSnapshot('{"version":1,"audit":{}}'), {
      ok: false,
      error: 'Invalid Atlas workspace snapshot schema.',
    });
    assert.deepEqual(loadEmbeddedWorkspaceSnapshot('{'), {
      ok: false,
      error: 'Invalid Atlas workspace snapshot JSON.',
    });
  });

  it('keeps invalid nested workspace payloads in persistent error state', async () => {
    const snapshot = createWorkspaceSnapshot(
      await readProjectSnapshotAsync(resolve('examples/java/my-app'))
    );
    const serialized = serializeWorkspaceSnapshot(snapshot);
    const cases = [
      corrupt(
        serialized,
        '"rules":[{"id":"cyclic-dependencies","status"',
        '"rules":[null,{"id":"cyclic-dependencies","status"'
      ),
      corrupt(serialized, '"findings":[', '"findings":[null,'),
      corrupt(serialized, '"cyclicPackages":[', '"cyclicPackages":[null,'),
      corrupt(serialized, '"nodes":[', '"nodes":[null,'),
      corrupt(serialized, '"edges":[', '"edges":[null,'),
      corrupt(serialized, '"imports":[', '"imports":[null,'),
    ];

    for (const serialized of cases) {
      assert.deepEqual(loadEmbeddedWorkspaceSnapshot(serialized), {
        ok: false,
        error: 'Invalid Atlas workspace snapshot schema.',
      });
    }
  });

  it('keeps Graph and Cytoscape identity failures in persistent error state', async () => {
    const snapshot = createWorkspaceSnapshot(
      await readProjectSnapshotAsync(resolve('examples/java/my-app'))
    );
    const nodes = snapshot.audit.packageGraph.nodes;
    const edges = snapshot.audit.packageGraph.edges;
    const firstNode = requiredItem(nodes[0], 'first graph node');
    const secondNode = requiredItem(nodes[1], 'second graph node');
    const firstEdge = requiredItem(edges[0], 'first graph edge');
    const secondEdge = requiredItem(edges[1], 'second graph edge');
    const cases = [
      serializeSnapshotWithGraph(snapshot, {
        ...snapshot.audit.packageGraph,
        nodes: [{ ...firstNode }, { ...secondNode, id: firstNode.id }, ...nodes.slice(2)],
      }),
      serializeSnapshotWithGraph(snapshot, {
        ...snapshot.audit.packageGraph,
        edges: [{ ...firstEdge }, { ...secondEdge, id: firstEdge.id }, ...edges.slice(2)],
      }),
      serializeSnapshotWithGraph(snapshot, {
        ...snapshot.audit.packageGraph,
        edges: [{ ...firstEdge, id: firstNode.id }, ...edges.slice(1)],
      }),
      serializeSnapshotWithGraph(snapshot, {
        ...snapshot.audit.packageGraph,
        edges: [{ ...firstEdge, source: 'missing.package' }, ...edges.slice(1)],
      }),
    ];

    for (const serialized of cases) {
      assert.deepEqual(loadEmbeddedWorkspaceSnapshot(serialized), {
        ok: false,
        error: 'Invalid Atlas workspace snapshot schema.',
      });
    }
  });

  it('keeps corrupted SourceGraphs in persistent error state', async () => {
    const snapshot = createWorkspaceSnapshot(
      await readProjectSnapshotAsync(resolve('examples/java/my-app'))
    );
    const serialized = serializeWorkspaceSnapshot(snapshot).replace(
      /"sourceGraph":"(?:[^"\\]|\\.)*"/u,
      '"sourceGraph":"{\\"version\\":1,\\"strings\\":[],\\"data\\":{}}"'
    );

    assert.deepEqual(loadEmbeddedWorkspaceSnapshot(serialized), {
      ok: false,
      error: 'Invalid Atlas workspace snapshot SourceGraph.',
    });
  });

  it('accepts structurally valid future vocabulary from external owners', async () => {
    const snapshot = createWorkspaceSnapshot(
      await readProjectSnapshotAsync(resolve('examples/java/my-app'))
    );
    const canonical = serializeWorkspaceSnapshot(snapshot);
    const serialized = canonical
      .replace('"severity":"warning"', '"severity":"notice"')
      .replace('"classification":"intrinsic"', '"classification":"workspace"');

    assert.notEqual(serialized, canonical);
    assert.equal(loadEmbeddedWorkspaceSnapshot(serialized).ok, true);
  });
});

/*** Replaces one known JSON segment so each regression corrupts one serializable boundary value. */
function corrupt(serialized: string, search: string, replacement: string): string {
  return serialized.replace(search, replacement);
}

/*** Serializes one otherwise-valid snapshot with a deliberately malformed dependency graph. */
function serializeSnapshotWithGraph(
  snapshot: ReturnType<typeof createWorkspaceSnapshot>,
  packageGraph: ReturnType<typeof createWorkspaceSnapshot>['audit']['packageGraph']
): string {
  return serializeWorkspaceSnapshot({
    ...snapshot,
    audit: { ...snapshot.audit, packageGraph },
  });
}

/*** Requires a fixture member so each identity regression identifies its setup failure. */
function requiredItem<Value>(value: Value | undefined, description: string): Value {
  if (value === undefined) throw new Error(`Missing ${description}.`);
  return value;
}
