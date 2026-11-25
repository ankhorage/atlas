'use client';

import type { RuleEvaluationPlanFacet, RuleEvaluationResult } from '@ankhorage/rules';
import { GraphView, type GraphViewNode } from '@ankhorage/zora/web/graph-view';
import { Select } from '@ankhorage/zora/web/select';
import { Tab } from '@ankhorage/zora/web/tab';
import { TabList } from '@ankhorage/zora/web/tab-list';
import { TabPanel } from '@ankhorage/zora/web/tab-panel';
import { Tabs } from '@ankhorage/zora/web/tabs';
import { Text } from '@ankhorage/zora/web/text';
import { type TreeItemNode, TreeView } from '@ankhorage/zora/web/tree-view';
import { View } from '@ankhorage/zora/web/view';
import React from 'react';

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
            Rule evaluation
          </Text>
          <Text variant="caption">{ruleEvaluationSummary(props.nodes.length)}</Text>
          <RuleFacetFilters
            facets={props.facets}
            filters={props.filters}
            onChange={props.setFilters}
          />
        </View>
      </section>
      {props.nodes.length === 0 ? <EmptyRuleEvaluation /> : <RuleDagVisualization {...props} />}
    </View>
  );
}

/*** Renders one accessible ZORA tab view for dependencies and another for execution outcomes. */
function RuleDagVisualization(props: RuleDagContentsProps) {
  return (
    <Tabs
      value={props.view}
      variant="line"
      onValueChange={value => {
        if (value === 'dependencies' || value === 'execution') props.setView(value);
      }}
    >
      <TabList fill>
        <Tab label="Dependencies" value="dependencies" />
        <Tab label="Results" value="execution" />
      </TabList>
      <TabPanel value="dependencies">
        {props.edges.length === 0 ? <NoRuleDependencies /> : <RuleDagGraph {...props} />}
      </TabPanel>
      <TabPanel value="execution">
        <TreeView
          ariaLabel="Rule evaluation results"
          expandedIds={props.expandedIds}
          expansionIndicator="chevron"
          nodes={props.treeNodes}
          selectedIds={props.selectedIds}
          onExpandedChange={props.setExpandedIds}
          onSelect={id => props.setSelectedIds([id])}
        />
      </TabPanel>
    </Tabs>
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
      style={{ height: 220, width: '100%' }}
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
    <View gap="xs">
      {[...facetsById.entries()].map(([id, values]) => (
        <Select
          key={id}
          label={formatFacetLabel(id)}
          options={[
            { label: 'All', value: '' },
            ...values.map(({ value, version }) => ({
              label: `${formatFacetLabel(value)} (v${version})`,
              value,
            })),
          ]}
          value={filters.find(filter => filter.id === id)?.values[0] ?? ''}
          onValueChange={value =>
            onChange([
              ...filters.filter(filter => filter.id !== id),
              { id, values: value === '' ? [] : [value] },
            ])
          }
        />
      ))}
    </View>
  );
}

/*** Converts provider facet identifiers into concise labels without changing their filter identity. */
function formatFacetLabel(value: string): string {
  return value
    .split(/[-_]/u)
    .filter(Boolean)
    .map(segment => segment.slice(0, 1).toUpperCase() + segment.slice(1))
    .join(' ');
}

/*** States the compact result count before a person chooses the detail they need. */
function ruleEvaluationSummary(count: number): string {
  return `${count} rule ${count === 1 ? 'instance' : 'instances'} in this evaluation.`;
}

/*** Explains that filtering removed the visible plan without treating it as a rule failure. */
function EmptyRuleEvaluation() {
  return <Text variant="caption">No rule instances match the current filters.</Text>;
}

/*** Explains a plan with no dependency edges while keeping results separately inspectable. */
function NoRuleDependencies() {
  return <Text variant="caption">These rule instances have no dependencies.</Text>;
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
