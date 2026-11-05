'use client';

import type { RuleEvaluationPlanFacet, RuleEvaluationResult } from '@ankhorage/rules';
import { GraphView, type GraphViewNode } from '@zora/graph-view';
import { Text } from '@zora/text';
import { type TreeItemNode, TreeView } from '@zora/tree-view';
import { View } from '@zora/view';
import React from 'react';

import { createRuleDagElements } from '@/features/rule-explorer/adapters/inbound/cytoscape/createRuleDagElements';
import {
  formatRuleDagStatus,
  projectRuleDag,
  type RuleDagNodeData,
  type RuleDagView,
  type RuleFacetFilter,
} from '@/features/rule-explorer/domain/projectRuleDag';

/*** Renders the evaluator-owned dependency and execution evidence without changing rule semantics. */
export function RuleDagExplorer({ evaluation }: RuleDagExplorerProps) {
  const [view, setView] = React.useState<RuleDagView>('dependencies');
  const [facetFilters, setFacetFilters] = React.useState<readonly RuleFacetFilter[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<readonly string[]>([]);
  const [expandedIds, setExpandedIds] = React.useState<readonly string[]>([]);
  const projection = React.useMemo(
    () => projectRuleDag(evaluation, facetFilters),
    [evaluation, facetFilters]
  );
  const cytoscapeElements = React.useMemo(() => createRuleDagElements(projection), [projection]);
  const nodes = React.useMemo(
    () => toGraphViewNodes(projection.graph.nodes, view),
    [projection, view]
  );
  const edges = React.useMemo(
    () => projection.graph.edges.map(({ id, source, target }) => ({ id, source, target })),
    [projection]
  );
  const treeNodes = React.useMemo(() => toTreeNodes(projection.graph.nodes), [projection]);

  return (
    <RuleDagContents
      view={view}
      setView={setView}
      facets={projection.availableFacets}
      filters={facetFilters}
      setFilters={setFacetFilters}
      nodes={nodes}
      edges={edges}
      treeNodes={treeNodes}
      selectedIds={selectedIds}
      setSelectedIds={setSelectedIds}
      expandedIds={expandedIds}
      setExpandedIds={setExpandedIds}
      cytoscapeElements={cytoscapeElements}
    />
  );
}

/*** Renders explorer controls and shared graph/tree selection after the pure projection is complete. */
function RuleDagContents(props: RuleDagContentsProps) {
  return (
    <View gap="m" p="xs">
      <section aria-label="Rule dependency explorer">
        <View gap="xs">
          <Text variant="label" weight="bold">
            Rule evaluation DAG
          </Text>
          <div role="group" aria-label="Rule DAG view">
            <button
              type="button"
              aria-pressed={props.view === 'dependencies'}
              onClick={() => props.setView('dependencies')}
            >
              Dependencies
            </button>
            <button
              type="button"
              aria-pressed={props.view === 'execution'}
              onClick={() => props.setView('execution')}
            >
              Execution
            </button>
          </div>
          <RuleFacetFilters
            facets={props.facets}
            filters={props.filters}
            onChange={props.setFilters}
          />
        </View>
      </section>
      {props.nodes.length === 0 ? null : <RuleDagVisualization {...props} />}
      <output aria-label="Rule graph projection" hidden>
        {JSON.stringify(props.cytoscapeElements)}
      </output>
    </View>
  );
}

/*** Renders graph and tree renderers only when the visible projection has graph content. */
function RuleDagVisualization(props: RuleDagContentsProps) {
  return (
    <>
      <RuleDagGraph {...props} />
      <TreeView
        ariaLabel="Rule DAG nodes"
        expandedIds={props.expandedIds}
        expansionIndicator="chevron"
        nodes={props.treeNodes}
        selectedIds={props.selectedIds}
        onExpandedChange={props.setExpandedIds}
        onSelect={id => props.setSelectedIds([id])}
      />
    </>
  );
}

/*** Renders the stable projected topology through the shared GraphView controller runtime. */
function RuleDagGraph({ view, edges, nodes, selectedIds, setSelectedIds }: RuleDagContentsProps) {
  return (
    <GraphView
      ariaLabel={`Rule ${view} graph`}
      edges={edges}
      layout="breadthfirst"
      nodes={nodes}
      selectedNodeIds={selectedIds}
      sizeNodesToLabels
      style={{ height: 260 }}
      styleRules={RULE_GRAPH_STYLES}
      onNodeEvent={event => {
        if (event.type === 'press') setSelectedIds([event.id]);
      }}
    />
  );
}

/*** Renders typed, provider-owned facets as controlled filters rather than inferred presentation tags. */
function RuleFacetFilters({ facets, filters, onChange }: RuleFacetFiltersProps) {
  const facetsById = groupFacetsById(facets);
  return (
    <div>
      {[...facetsById.entries()].map(([id, values]) => (
        <label key={id}>
          {id}
          <select
            value={filters.find(filter => filter.id === id)?.values[0] ?? ''}
            onChange={event =>
              onChange([
                ...filters.filter(filter => filter.id !== id),
                { id, values: event.target.value === '' ? [] : [event.target.value] },
              ])
            }
          >
            <option value="">All</option>
            {values.map(({ value, version }) => (
              <option key={`${value}:${version}`} value={value}>{`${value} (v${version})`}</option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

/*** Maps stable evaluator node identities into the existing graph renderer's neutral contract. */
function toGraphViewNodes(
  nodes: readonly { readonly id: string; readonly data: RuleDagNodeData }[],
  view: RuleDagView
): readonly GraphViewNode[] {
  return nodes.map(({ id, data }) => ({
    id,
    classes: data.status?.toLowerCase() ?? 'not-executed',
    label:
      view === 'dependencies'
        ? data.label
        : `${formatRuleDagStatus(data.status)} · ${data.provenance}`,
  }));
}

/*** Presents scoped instances once in the tree while the graph retains shared dependency edges. */
function toTreeNodes(
  nodes: readonly { readonly id: string; readonly data: RuleDagNodeData }[]
): readonly TreeItemNode[] {
  return nodes.map(({ id, data }) => ({
    id,
    label: `${data.ruleId} · ${formatRuleDagStatus(data.status)} · ${data.provenance}`,
    meta: data.scope,
  }));
}

/*** Groups only explicitly versioned plan facets for filter controls. */
function groupFacetsById(
  facets: readonly RuleEvaluationPlanFacet[]
): ReadonlyMap<string, readonly RuleEvaluationPlanFacet[]> {
  return new Map(
    [...new Set(facets.map(facet => facet.id))].map(id => [
      id,
      facets.filter(facet => facet.id === id),
    ])
  );
}

const RULE_GRAPH_STYLES = [
  {
    selector: 'node',
    style: { 'background-color': '#64748b', color: '#0f172a', label: 'data(label)' },
  },
  { selector: '.pass', style: { 'background-color': '#16a34a' } },
  { selector: '.fail', style: { 'background-color': '#dc2626' } },
  { selector: '.incomplete', style: { 'background-color': '#ca8a04' } },
  { selector: '.error', style: { 'background-color': '#7f1d1d' } },
  { selector: '.not-executed', style: { 'background-color': '#64748b' } },
] as const;

interface RuleDagExplorerProps {
  readonly evaluation: RuleEvaluationResult;
}

interface RuleFacetFiltersProps {
  readonly facets: readonly RuleEvaluationPlanFacet[];
  readonly filters: readonly RuleFacetFilter[];
  readonly onChange: (filters: readonly RuleFacetFilter[]) => void;
}

interface RuleDagContentsProps {
  readonly cytoscapeElements: ReturnType<typeof createRuleDagElements>;
  readonly edges: readonly {
    readonly id: string;
    readonly source: string;
    readonly target: string;
  }[];
  readonly expandedIds: readonly string[];
  readonly facets: readonly RuleEvaluationPlanFacet[];
  readonly filters: readonly RuleFacetFilter[];
  readonly nodes: readonly GraphViewNode[];
  readonly selectedIds: readonly string[];
  readonly setExpandedIds: (ids: readonly string[]) => void;
  readonly setFilters: (filters: readonly RuleFacetFilter[]) => void;
  readonly setSelectedIds: (ids: readonly string[]) => void;
  readonly setView: (view: RuleDagView) => void;
  readonly treeNodes: readonly TreeItemNode[];
  readonly view: RuleDagView;
}
