import { describe, expect, it, render } from '@artiphishle/testosterone';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import { useWorkspaceNavigation } from '@/features/workspace/adapters/inbound/react/useWorkspaceNavigation';
import type { PackageDependencyGraph } from '@/types/dependencyAnalysis';
import type { ProjectTreeNode } from '@/types/projectTree';
import type { WorkspaceLoadResult } from '@/types/workspace';

describe('[useWorkspaceNavigation]', () => {
  it('keeps exact selection independent from folder and breadcrumb navigation', () => {
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
            {`${navigation.selectedGraphNodeId ?? ''}|${navigation.selectedTreeId ?? ''}|${navigation.currentPackage}`}
          </output>
          <button onClick={() => navigation.selectProjectTreeNode(io)}>tree-io</button>
          <button onClick={() => navigation.selectProjectTreeNode(coderadar)}>tree-coderadar</button>
          <button onClick={() => navigation.toggleProjectTreeNode(io, true)}>expand-io</button>
          <button onClick={() => navigation.toggleProjectTreeNode(reflectoring, true)}>
            expand-reflectoring
          </button>
          <button onClick={() => navigation.toggleProjectTreeNode(reflectoring, false)}>
            collapse-reflectoring
          </button>
          <button onClick={() => navigation.toggleProjectTreeNode(io, false)}>collapse-io</button>
          <button onClick={() => navigation.selectGraphNode('io')}>graph-io</button>
          <button onClick={() => navigation.selectGraphNode('io.reflectoring.coderadar')}>
            graph-coderadar
          </button>
          <button onClick={() => navigation.selectGraphNode('external')}>graph-external</button>
          <button onClick={() => navigation.unselectGraphNode('io.reflectoring.coderadar')}>
            stale-unselect
          </button>
          <button onClick={() => navigation.unselectGraphNode('external')}>clear-external</button>
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

      click('tree-io');
      expect(output()).toBe('io|directory:io|');

      click('expand-io');
      expect(output()).toBe('io|directory:io|io');

      click('tree-coderadar');
      expect(output()).toBe(
        'io.reflectoring.coderadar|directory:io/reflectoring/coderadar|io'
      );

      click('expand-reflectoring');
      expect(output()).toBe(
        'io.reflectoring.coderadar|directory:io/reflectoring/coderadar|io.reflectoring'
      );

      click('collapse-reflectoring');
      expect(output()).toBe('io.reflectoring.coderadar|directory:io/reflectoring/coderadar|io');

      click('graph-io');
      expect(output()).toBe('io|directory:io|io');

      click('collapse-io');
      expect(output()).toBe('io|directory:io|');

      click('graph-coderadar');
      expect(output()).toBe('io.reflectoring.coderadar|directory:io/reflectoring/coderadar|');

      click('graph-external');
      expect(output()).toBe('external||');
      click('stale-unselect');
      expect(output()).toBe('external||');
      click('clear-external');
      expect(output()).toBe('||');

      click('expand-io');
      click('home');
      expect(output()).toBe('||');
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
