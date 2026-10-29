import { resolve } from 'node:path';

import { createDependencyGraphAsync } from '@ankhorage/dependency-graph';
import { describe, expect, it, render } from '@artiphishle/testosterone';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import { readProjectSnapshotAsync } from '@/features/project-analysis/composition/readProjectSnapshotAsync';
import { useWorkspaceNavigation } from '@/features/workspace/adapters/inbound/react/useWorkspaceNavigation';
import { createWorkspaceSnapshot } from '@/features/workspace/application/use-cases/createWorkspaceSnapshot';
import { serializeWorkspaceSnapshot } from '@/features/workspace/application/use-cases/serializeWorkspaceSnapshot';
import { loadEmbeddedWorkspaceSnapshot } from '@/features/workspace/composition/loadEmbeddedWorkspaceSnapshot';
import { loadWorkspaceAsync } from '@/features/workspace/composition/loadWorkspaceAsync';
import type { PackageDependencyGraph } from '@/types/dependencyAnalysis';
import type { ProjectTreeNode } from '@/types/projectTree';
import type { WorkspaceLoadResult } from '@/types/workspace';

describe('[useWorkspaceNavigation]', () => {
  it('keeps real graph and tree selections plus navigation transitions identical for online and embedded hydration', async () => {
    const projectPath = resolve('examples/java/my-app');
    const online = await loadWorkspaceAsync(projectPath, inspection =>
      createDependencyGraphAsync({ projects: [{ id: 'current', inspection }] })
    );
    const embedded = loadEmbeddedWorkspaceSnapshot(
      serializeWorkspaceSnapshot(
        createWorkspaceSnapshot(await readProjectSnapshotAsync(projectPath))
      )
    );

    expect(online.ok).toBe(true);
    expect(embedded.ok).toBe(true);
    if (!online.ok || !embedded.ok) return;

    expect(observeWorkspaceTransitions(embedded)).toEqual(observeWorkspaceTransitions(online));
  });

  it('synchronizes replace and toggle selection across tree and graph without changing navigation', () => {
    const tree = coderadarTree();
    const workspace = createWorkspace(tree);
    const host = render(<div />);
    const root = createRoot(host.container);

    function Harness() {
      const navigation = useWorkspaceNavigation(workspace);
      const io = requiredNode(tree[0]);
      const reflectoring = requiredNode(io.children?.[0]);
      const coderadar = requiredNode(reflectoring.children?.[0]);

      return (
        <>
          <output>
            {`${navigation.selectedGraphNodeIds.join(',')}|${navigation.selectedTreeIds.join(',')}|${navigation.currentPackage}`}
          </output>
          <button onClick={() => navigation.selectProjectTreeNode(io, 'replace')}>
            tree-io-replace
          </button>
          <button onClick={() => navigation.selectProjectTreeNode(coderadar, 'toggle')}>
            tree-coderadar-toggle
          </button>
          <button onClick={() => navigation.selectGraphNode('external', 'toggle')}>
            graph-external-toggle
          </button>
          <button onClick={() => navigation.selectGraphNode('io', 'toggle')}>
            graph-io-toggle
          </button>
          <button onClick={() => navigation.selectGraphNode('io', 'replace')}>
            graph-io-replace
          </button>
          <button onClick={() => navigation.navigateToPackage('')}>home</button>
        </>
      );
    }

    const click = (label: string) =>
      flushSync(() => {
        const button = Array.from(host.container.querySelectorAll('button')).find(
          node => node.textContent === label
        );
        if (!button) throw new Error(`Missing ${label} button`);
        button.click();
      });
    const output = () => host.container.querySelector('output')?.textContent;

    try {
      flushSync(() => root.render(<Harness />));

      click('tree-io-replace');
      expect(output()).toBe('io|directory:io|');

      click('tree-coderadar-toggle');
      expect(output()).toBe(
        'io,io.reflectoring.coderadar|directory:io,directory:io/reflectoring/coderadar|'
      );

      click('graph-external-toggle');
      expect(output()).toBe(
        'io,io.reflectoring.coderadar,external|directory:io,directory:io/reflectoring/coderadar|'
      );

      click('graph-io-toggle');
      expect(output()).toBe(
        'io.reflectoring.coderadar,external|directory:io/reflectoring/coderadar|'
      );

      click('home');
      expect(output()).toBe(
        'io.reflectoring.coderadar,external|directory:io/reflectoring/coderadar|'
      );

      click('graph-io-replace');
      expect(output()).toBe('io|directory:io|');
    } finally {
      flushSync(() => root.unmount());
      host.unmount();
    }
  });
});

/*** Require one fixture tree node for concise interaction setup. */
function requiredNode(node: ProjectTreeNode | undefined): ProjectTreeNode {
  if (!node) throw new Error('Missing project-tree fixture');
  return node;
}

/*** Build a workspace whose structural graph packages are all valid selectable nodes. */
function createWorkspace(tree: readonly ProjectTreeNode[]): WorkspaceLoadResult {
  return {
    ok: true,
    value: {
      packageGraph: createGraph(),
      projectIdentity: 'test-project',
      tree,
      evaluation: {
        architecture: { candidates: [] },
        cyclicPackages: [],
        genericRules: { diagnostics: [], findings: [] },
        rules: [],
      },
    },
  };
}

/*** Create graph nodes around a relationship-free io/reflectoring container chain. */
function createGraph(): PackageDependencyGraph {
  const ids = ['io', 'io.reflectoring', 'io.reflectoring.coderadar', 'external'];
  return {
    nodes: ids.map(id => ({
      id,
      data: {
        classification: id === 'external' ? 'vendor' : 'intrinsic',
        path: id,
        parent: id.includes('.') ? id.split('.').slice(0, -1).join('.') : '',
        label: id,
        name: id,
        isIntrinsic: id !== 'external',
      },
    })),
    edges: [
      {
        id: 'io.reflectoring.coderadar->external',
        source: 'io.reflectoring.coderadar',
        target: 'external',
        data: { weight: 1, evidence: [] },
      },
    ],
  };
}

/*** Build the io/reflectoring/coderadar TreeView regression hierarchy. */
function coderadarTree(): readonly ProjectTreeNode[] {
  return [
    {
      id: 'directory:io',
      graphPackage: 'io.reflectoring.coderadar',
      kind: 'directory',
      label: 'io',
      children: [
        {
          id: 'directory:io/reflectoring',
          graphPackage: 'io.reflectoring.coderadar',
          kind: 'directory',
          label: 'reflectoring',
          children: [
            {
              id: 'directory:io/reflectoring/coderadar',
              graphPackage: 'io.reflectoring.coderadar',
              kind: 'directory',
              label: 'coderadar',
            },
          ],
        },
      ],
    },
  ];
}

/*** Records selection and navigation transitions through the real hydrated workspace projections. */
function observeWorkspaceTransitions(workspace: WorkspaceLoadResult): readonly string[] {
  if (!workspace.ok) throw new Error('Expected hydrated workspace.');
  const graphTreeSelection = findGraphTreeSelection(
    workspace.value.packageGraph,
    workspace.value.tree
  );
  const secondGraphNode = workspace.value.packageGraph.nodes.find(
    candidate => candidate.id !== graphTreeSelection?.graphNode.id
  );
  if (graphTreeSelection === undefined || secondGraphNode === undefined) {
    throw new Error('Expected graph fixture nodes.');
  }
  const { graphNode, treeNode } = graphTreeSelection;
  const selectedGraphNode = secondGraphNode;

  const host = render(<div />);
  const root = createRoot(host.container);
  const transitions: string[] = [];

  function Harness() {
    const navigation = useWorkspaceNavigation(workspace);
    return (
      <>
        <output>
          {`${navigation.selectedGraphNodeIds.join(',')}|${navigation.selectedTreeIds.join(',')}|${navigation.currentPackage}`}
        </output>
        <button onClick={() => navigation.selectProjectTreeNode(treeNode, 'replace')}>tree</button>
        <button onClick={() => navigation.selectGraphNode(selectedGraphNode.id, 'toggle')}>
          graph
        </button>
        <button onClick={() => navigation.navigateToPackage(graphNode.id.replaceAll('.', '/'))}>
          navigate
        </button>
      </>
    );
  }

  const click = (label: string) => {
    flushSync(() => {
      const button = Array.from(host.container.querySelectorAll('button')).find(
        node => node.textContent === label
      );
      if (button === undefined) throw new Error(`Missing ${label} button`);
      button.click();
    });
    transitions.push(host.container.querySelector('output')?.textContent ?? '');
  };

  try {
    flushSync(() => root.render(<Harness />));
    click('tree');
    click('graph');
    click('navigate');
    return transitions;
  } finally {
    flushSync(() => root.unmount());
    host.unmount();
  }
}

/*** Finds one tree row with the graph node it represents in a hydrated workspace projection. */
function findGraphTreeSelection(
  graph: PackageDependencyGraph,
  nodes: readonly ProjectTreeNode[]
):
  | {
      readonly graphNode: PackageDependencyGraph['nodes'][number];
      readonly treeNode: ProjectTreeNode;
    }
  | undefined {
  for (const node of nodes) {
    const graphNode = graph.nodes.find(candidate => candidate.id === node.graphPackage);
    if (graphNode !== undefined) return { graphNode, treeNode: node };
    const nested =
      node.children === undefined ? undefined : findGraphTreeSelection(graph, node.children);
    if (nested !== undefined) return nested;
  }
  return undefined;
}
