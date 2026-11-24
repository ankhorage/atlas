import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { createDependencyGraphAsync } from '@ankhorage/dependency-graph';
import { assert, describe, it } from '@artiphishle/testosterone';

import { createPackageGraphElements } from '@/features/graph-view/adapters/inbound/cytoscape/createPackageGraphElements';
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

  it('hydrates and renders the published v1 offline snapshot that predates node kinds', () => {
    const workspace = loadEmbeddedWorkspaceSnapshot(releasedV1OfflineSnapshot());

    assert.equal(workspace.ok, true);
    if (!workspace.ok) return;

    assert.deepEqual(
      workspace.value.packageGraph.nodes.map(node => [node.id, node.data.parent, node.data.kind]),
      [
        ['src', '', undefined],
        ['src.features', 'src', undefined],
        ['src.features.nested', 'src.features', undefined],
      ]
    );
    assert.deepEqual(
      workspace.value.packageGraph.edges.map(edge => [edge.id, edge.source, edge.target]),
      [
        ['src->src.features', 'src', 'src.features'],
        ['src.features->src.features.nested', 'src.features', 'src.features.nested'],
      ]
    );
    assert.deepEqual(
      workspace.value.tree.map(node => [node.id, node.graphPackage]),
      [['project:root', '']]
    );
    assert.deepEqual(
      workspace.value.tree[0]?.children?.slice(0, 2).map(node => node.label),
      ['src', 'support']
    );
    assert.equal(workspace.value.tree[0]?.label, 'compound-selection');
    assert.deepEqual(workspace.value.tree[0]?.children?.at(-1), {
      graphPackage: '',
      id: 'feature-evidence:unavailable:current',
      kind: 'virtual',
      label: 'Feature evidence unavailable',
      unavailable: true,
    });
    assert.deepEqual(
      createPackageGraphElements(workspace.value.packageGraph).nodes.map(node => [
        node.data.id,
        node.data.parent,
      ]),
      [
        ['src', ''],
        ['src.features', 'src'],
        ['src.features.nested', 'src.features'],
      ]
    );
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

/*** Reads the exact v1 artifact produced by Atlas v0.21.3 for its released compound-selection fixture. */
function releasedV1OfflineSnapshot(): string {
  return gunzipSync(Buffer.from(RELEASED_V1_OFFLINE_SNAPSHOT, 'base64')).toString('utf8');
}

const RELEASED_V1_OFFLINE_SNAPSHOT =
  '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';
