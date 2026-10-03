import type { GraphViewEdge, GraphViewNode } from '@zora/graph-view';
import type { ElementsDefinition } from 'cytoscape';

import { createCompoundOpacityIndex } from '@/features/graph-view/utils/createCompoundOpacityIndex';
import { readNodeDefinitionId } from '@/features/graph-view/utils/readNodeDefinitionId';
import type { CycleHighlight } from '@/types/auditVisualization';

/***
 * Projects PKGViz graph data into the engine-neutral ZORA GraphView contract.
 * @performance
 * Performance invariant: build package and cycle indexes once per projection, then use lookups
 * in element conversion. Do not move full-graph or full-cycle scans into the node/edge callbacks.
 * Recheck test/benchmarks/graphPresentation.ts and the README Performance evidence when changing
 * this path; CPU model timings do not establish browser rendering or layout performance.
 */
export function createGraphViewModel(
  allElements: ElementsDefinition,
  visibleElements: ElementsDefinition,
  cycleHighlights: readonly CycleHighlight[]
): GraphViewModel {
  const visibleNodeIds = new Set(
    visibleElements.nodes
      .map(node => readNodeDefinitionId(node))
      .filter((id): id is string => id !== null)
  );
  const parentById = createVisibleParentMap(visibleElements, visibleNodeIds);
  const detachedNodeIds = getDetachedNodeIds(visibleElements, parentById);
  const packageParents = indexPackageParents(allElements);
  const parentNodeIds = new Set([...visibleNodeIds].filter(id => packageParents.has(id)));
  const cycles = indexCyclePresentation(cycleHighlights);
  const appearance = {
    cycles: cycles.nodes,
    opacity: createCompoundOpacityIndex(parentById, detachedNodeIds),
  };

  return {
    edges: visibleElements.edges.flatMap(edge => createGraphViewEdge(edge, cycles.edges)),
    nodes: visibleElements.nodes.flatMap(node =>
      createGraphViewNode(node, parentById, detachedNodeIds, parentNodeIds, appearance)
    ),
    parentNodeIds,
  };
}

interface GraphViewModel {
  readonly edges: readonly GraphViewEdge[];
  readonly nodes: readonly GraphViewNode[];
  readonly parentNodeIds: ReadonlySet<string>;
}

/***
 * Indexes package ancestry once instead of scanning the full graph for each visible package.
 * @performance
 * Replacing this set with nodes.some(...) per visible node restores quadratic work for large
 * projections. Walk dotted boundaries, including missing intermediate packages, so hidden
 * descendants remain navigable without confusing sibling prefixes such as a.b and a.bc.
 * Mutation is confined to this fresh index; source elements are never modified.
 */
function indexPackageParents(elements: ElementsDefinition): ReadonlySet<string> {
  const parents = new Set<string>();
  for (const node of elements.nodes) {
    const id = readNodeDefinitionId(node);
    if (id === null) continue;
    for (
      let boundary = id.lastIndexOf('.');
      boundary >= 0;
      boundary = id.lastIndexOf('.', boundary - 1)
    ) {
      parents.add(id.slice(0, boundary));
      if (boundary === 0) break;
    }
  }
  return parents;
}

/***
 * Indexes cycle overlays with last-cycle precedence and the first matching directed-edge step.
 * @performance
 * Visit overlay membership once, not every cycle for every rendered element. The reverse edge
 * traversal makes the first occurrence win within a cycle; later cycles still overwrite earlier
 * ones. Keep directed source/target keys distinct. Model regression tests protect this precedence.
 */
function indexCyclePresentation(highlights: readonly CycleHighlight[]) {
  const nodes = new Map<string, string>();
  const edges = new Map<string, Map<string, { readonly color: string; readonly step: number }>>();
  for (const highlight of highlights) {
    for (const id of highlight.cycle.packages) nodes.set(id, highlight.color);
    highlight.cycle.edges.toReversed().forEach((edge, index) => {
      const targets =
        edges.get(edge.from) ??
        new Map<string, { readonly color: string; readonly step: number }>();
      targets.set(edge.to, { color: highlight.color, step: highlight.cycle.edges.length - index });
      edges.set(edge.from, targets);
    });
  }
  return { edges, nodes };
}

/*** Builds only compound-parent relations whose parent is present in the visible graph. */
function createVisibleParentMap(
  elements: ElementsDefinition,
  visibleNodeIds: ReadonlySet<string>
): ReadonlyMap<string, string> {
  return new Map(
    elements.nodes.flatMap(node => {
      const id = readNodeDefinitionId(node);
      const parentId = readString(node.data.parent);
      return id && parentId && visibleNodeIds.has(parentId) ? [[id, parentId] as const] : [];
    })
  );
}

/*** Detaches descendants participating in ancestor edges so every dependency has drawable endpoints. */
function getDetachedNodeIds(
  elements: ElementsDefinition,
  parentById: ReadonlyMap<string, string>
): ReadonlySet<string> {
  const detachedNodeIds = new Set<string>();

  for (const edge of elements.edges) {
    const source = readString(edge.data.source);
    const target = readString(edge.data.target);
    if (!source || !target) continue;

    if (isAncestor(source, target, parentById)) detachedNodeIds.add(target);
    else if (isAncestor(target, source, parentById)) detachedNodeIds.add(source);
  }

  return detachedNodeIds;
}

/*** Returns whether one visible node contains another through the compound-parent chain. */
function isAncestor(
  possibleAncestor: string,
  nodeId: string,
  parentById: ReadonlyMap<string, string>
): boolean {
  const visited = new Set<string>();
  let current = parentById.get(nodeId);

  while (current !== undefined && !visited.has(current)) {
    if (current === possibleAncestor) return true;
    visited.add(current);
    current = parentById.get(current);
  }

  return false;
}

/***
 * Converts one visible node using prepared parent and cycle lookups.
 * @performance
 * Resolve labels once per model update. ZORA measures styled labels during reconciliation;
 * do not restore character-count width estimates or per-frame consumer measurement callbacks.
 */
function createGraphViewNode(
  node: ElementsDefinition['nodes'][number],
  parentById: ReadonlyMap<string, string>,
  detachedNodeIds: ReadonlySet<string>,
  parentNodeIds: ReadonlySet<string>,
  appearance: {
    readonly cycles: ReadonlyMap<string, string>;
    readonly opacity: ReadonlyMap<string, number>;
  }
): GraphViewNode[] {
  const id = readNodeDefinitionId(node);
  if (id === null) return [];

  const cycleColor = appearance.cycles.get(id);
  const parentId = detachedNodeIds.has(id) ? undefined : parentById.get(id);
  const label = readString(node.data.label) ?? readString(node.data.name) ?? id;

  return [
    {
      id,
      label,
      parentId,
      classes: appendClasses(
        readClasses(node.classes),
        parentNodeIds.has(id) ? 'isParent' : undefined,
        cycleColor !== undefined ? 'auditCycle' : undefined
      ),
      data: {
        ...node.data,
        compoundFillOpacity: appearance.opacity.get(id) ?? 0.04,
        parent: parentId,
        ...(cycleColor !== undefined ? { auditCycleColor: cycleColor } : {}),
      },
    },
  ];
}

/*** Convert one visible edge while projecting audit-cycle presentation metadata. */
function createGraphViewEdge(
  edge: ElementsDefinition['edges'][number],
  cycleEdges: ReturnType<typeof indexCyclePresentation>['edges']
): GraphViewEdge[] {
  const source = readString(edge.data.source);
  const target = readString(edge.data.target);
  if (!source || !target) return [];

  const cycle = cycleEdges.get(source)?.get(target);
  return [
    {
      id: readString(edge.data.id),
      source,
      target,
      classes: appendClasses(readClasses(edge.classes), cycle ? 'auditCycle' : undefined),
      data: {
        ...edge.data,
        ...(cycle
          ? {
              auditCycleColor: cycle.color,
              auditCycleStep: String(cycle.step),
            }
          : {}),
      },
    },
  ];
}

/*** Normalize Cytoscape class declarations into the GraphView string contract. */
function readClasses(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.filter((entry): entry is string => typeof entry === 'string').join(' ');
}

/*** Append optional classes without introducing duplicate whitespace. */
function appendClasses(base: string, ...classes: readonly (string | undefined)[]): string {
  return [base, ...classes]
    .filter(value => value && value.length > 0)
    .join(' ')
    .trim();
}

/*** Read one optional string data field at the adapter boundary. */
function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
