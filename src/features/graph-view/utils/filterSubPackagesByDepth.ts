import type { EdgeDefinition, ElementsDefinition } from 'cytoscape';

import { findNearestPackageRoot } from '@/features/graph-view/utils/findNearestPackageRoot';
import { findPackageRoots } from '@/features/graph-view/utils/findPackageRoots';
import { readGraphNodeId } from '@/features/graph-view/utils/readGraphNodeId';

/***
 * Filters packages to a relative depth and lifts dependency edges onto the visible ancestors.
 * @performance Aggregate edge weights and origin IDs in local maps so large lifted bundles remain
 * linear in edge count while source graph elements stay immutable.
 */
export function filterSubPackagesByDepth(
  elements: ElementsDefinition,
  allowSelfLoops = false,
  maxDepth = 1
): ElementsDefinition {
  const packageIds = readPackageIds(elements);
  const projection = createDepthProjection(packageIds, maxDepth);

  return {
    nodes: elements.nodes.filter(node => {
      const id = readGraphNodeId(node.data.id);
      return id !== null && projection.visibleNodeIds.has(id);
    }),
    edges: aggregateVisibleEdges(
      elements.edges,
      projection.packageToVisible,
      projection.visibleNodeIds,
      allowSelfLoops
    ),
  };
}

/*** Reads only valid package identities from graph nodes. */
function readPackageIds(elements: ElementsDefinition): readonly string[] {
  return elements.nodes.flatMap(node => {
    const id = readGraphNodeId(node.data.id);
    return id === null ? [] : [id];
  });
}

/*** Maps every package onto the deepest existing ancestor visible at the selected depth. */
function createDepthProjection(packageIds: readonly string[], maxDepth: number): DepthProjection {
  const existing = new Set(packageIds);
  const roots = new Set(findPackageRoots(packageIds));
  const packageToVisible = new Map(
    packageIds.map(packageId => {
      const root = findNearestPackageRoot(packageId, roots);
      return [packageId, visibleAncestorForDepth(root, packageId, maxDepth, existing)] as const;
    })
  );

  return {
    packageToVisible,
    visibleNodeIds: new Set(packageToVisible.values()),
  };
}

/*** Resolves the deepest existing package ancestor within a relative depth limit. */
function visibleAncestorForDepth(
  root: string,
  packageId: string,
  maxDepth: number,
  existing: ReadonlySet<string>
): string {
  if (maxDepth <= 1) return root;
  const rootDepth = root.split('.').length;
  const packageParts = packageId.split('.');
  const desiredDepth = Math.min(rootDepth + maxDepth - 1, packageParts.length);
  const candidates = Array.from({ length: desiredDepth - rootDepth + 1 }, (_, index) =>
    packageParts.slice(0, desiredDepth - index).join('.')
  );
  return candidates.find(candidate => existing.has(candidate)) ?? root;
}

/*** Lifts and aggregates dependency edges onto the selected visible package identities. */
function aggregateVisibleEdges(
  edges: ElementsDefinition['edges'],
  packageToVisible: ReadonlyMap<string, string>,
  visibleNodeIds: ReadonlySet<string>,
  allowSelfLoops: boolean
): EdgeDefinition[] {
  const edgeMap = new Map<string, EdgeDefinition>();
  const edgeOrigins = new Map<string, string[]>();

  for (const edge of edges) {
    const endpoints = readVisibleEndpoints(edge, packageToVisible, visibleNodeIds);
    if (endpoints === null) continue;
    if (!allowSelfLoops && endpoints.source === endpoints.target) continue;
    aggregateEdge(edge, endpoints, edgeMap, edgeOrigins);
  }

  return [...edgeMap.values()];
}

/*** Resolves one edge's lifted endpoints when both remain visible. */
function readVisibleEndpoints(
  edge: EdgeDefinition,
  packageToVisible: ReadonlyMap<string, string>,
  visibleNodeIds: ReadonlySet<string>
): VisibleEndpoints | null {
  const source = readGraphNodeId(edge.data.source);
  const target = readGraphNodeId(edge.data.target);
  if (source === null || target === null) return null;

  const liftedSource = packageToVisible.get(source) ?? source;
  const liftedTarget = packageToVisible.get(target) ?? target;
  if (!visibleNodeIds.has(liftedSource) || !visibleNodeIds.has(liftedTarget)) return null;
  return { source: liftedSource, target: liftedTarget, rawSource: source, rawTarget: target };
}

/*** Adds one source edge into its visible aggregate without copying previously collected origins. */
function aggregateEdge(
  edge: EdgeDefinition,
  endpoints: VisibleEndpoints,
  edgeMap: Map<string, EdgeDefinition>,
  edgeOrigins: Map<string, string[]>
): void {
  const key = `${endpoints.source}->${endpoints.target}`;
  const origins = edgeOrigins.get(key) ?? [];
  origins.push(readGraphNodeId(edge.data.id) ?? `${endpoints.rawSource}->${endpoints.rawTarget}`);
  edgeOrigins.set(key, origins);

  const existing = edgeMap.get(key);
  if (existing !== undefined) {
    existing.data.weight = readWeight(existing.data.weight) + readWeight(edge.data.weight);
    return;
  }

  edgeMap.set(key, {
    ...edge,
    data: {
      ...edge.data,
      id: key,
      originalEdgeIds: origins,
      source: endpoints.source,
      target: endpoints.target,
      weight: readWeight(edge.data.weight),
    },
  });
}

/*** Reads the numeric edge weight used by PKGViz aggregation, defaulting missing values to one. */
function readWeight(value: unknown): number {
  return typeof value === 'number' ? value : 1;
}

interface DepthProjection {
  readonly packageToVisible: ReadonlyMap<string, string>;
  readonly visibleNodeIds: ReadonlySet<string>;
}

interface VisibleEndpoints {
  readonly source: string;
  readonly target: string;
  readonly rawSource: string;
  readonly rawTarget: string;
}
