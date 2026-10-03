import type { DependencyGraph, DependencyGraphNodeData } from '@ankhorage/dependency-graph';
import type { GraphEdge, GraphNode } from '@ankhorage/graph';

import type {
  PackageDependencyEdgeData,
  PackageDependencyGraph,
  PackageDependencyNodeData,
} from '@/types/dependencyAnalysis';

/*** Project the canonical owner graph into Atlas package identities without re-analyzing source. */
export function projectDependencyGraph(graph: DependencyGraph): PackageDependencyGraph {
  const projectedIds = new Map<string, string>();
  const nodes = new Map<string, GraphNode<PackageDependencyNodeData>>();

  for (const node of graph.nodes) {
    const id = packageId(node.data);
    if (id === undefined) continue;
    projectedIds.set(node.id, id);
    if (!nodes.has(id)) nodes.set(id, projectNode(id, node.data));
  }

  const edges = new Map<string, GraphEdge<PackageDependencyEdgeData>>();
  for (const edge of graph.edges) {
    const source = projectedIds.get(edge.source);
    const target = projectedIds.get(edge.target);
    if (source === undefined || target === undefined || source === target) continue;

    const id = `${source}->${target}`;
    const existing = edges.get(id);
    edges.set(id, {
      id,
      source,
      target,
      data: {
        weight: (existing?.data.weight ?? 0) + edge.data.weight,
        evidence: [...(existing?.data.evidence ?? []), ...edge.data.evidence],
      },
    });
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

/*** Resolve the stable package identity represented by one canonical dependency node. */
function packageId(data: DependencyGraphNodeData): string | undefined {
  if (data.kind === 'module') return nonEmpty(data.path);
  if (data.focus && (data.path === undefined || data.path === '.')) return undefined;
  return nonEmpty(data.packageName) ?? nonEmpty(data.label);
}

/*** Convert one owner node into the metadata shape required by Atlas graph projection. */
function projectNode(
  id: string,
  data: DependencyGraphNodeData
): GraphNode<PackageDependencyNodeData> {
  const intrinsic = data.classification === 'intrinsic' || data.focus;
  const parent =
    data.kind === 'module' ? (data.parentPath ?? parentPackage(id)) : parentPackage(id);
  const label = data.kind === 'module' ? data.label : id;

  return {
    id,
    data: {
      classification: data.classification,
      path: id,
      parent,
      label,
      name: label,
      ...(intrinsic ? { isIntrinsic: true } : {}),
    },
  };
}

/*** Resolve the dotted parent package used by Atlas compound-node projection. */
function parentPackage(id: string): string {
  return id.includes('.') ? id.split('.').slice(0, -1).join('.') : '';
}

/*** Normalize optional owner identifiers before they become graph identities. */
function nonEmpty(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  return normalized;
}
