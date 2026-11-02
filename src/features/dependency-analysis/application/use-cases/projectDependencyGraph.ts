import type { DependencyGraph, DependencyGraphNodeData } from '@ankhorage/dependency-graph';
import type { GraphEdge, GraphNode } from '@ankhorage/graph';

import type {
  PackageDependencyEdgeData,
  PackageDependencyGraph,
  PackageDependencyNodeData,
  RepositoryGraphIdentity,
} from '@/types/dependencyAnalysis';

/*** Project the canonical owner graph into Atlas package identities without re-analyzing source. */
export function projectDependencyGraph(
  graph: DependencyGraph,
  repositories: ReadonlyMap<string, RepositoryGraphIdentity> = new Map()
): PackageDependencyGraph {
  const projectedIds = new Map<string, string>();
  const nodes = new Map<string, GraphNode<PackageDependencyNodeData>>();

  for (const node of graph.nodes) {
    const id = packageId(node.data, repositories);
    if (id === undefined) continue;
    projectedIds.set(node.id, id);
    if (!nodes.has(id)) nodes.set(id, projectNode(id, node.data, repositories));
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
function packageId(
  data: DependencyGraphNodeData,
  repositories: ReadonlyMap<string, RepositoryGraphIdentity>
): string | undefined {
  const repository = data.projectId === undefined ? undefined : repositories.get(data.projectId);
  if (repository !== undefined) return repositoryPackageId(repository.id, data);
  if (data.kind === 'module') return nonEmpty(data.path);
  if (data.focus && (data.path === undefined || data.path === '.')) return undefined;
  return nonEmpty(data.packageName) ?? nonEmpty(data.label);
}

/*** Convert one owner node into the metadata shape required by Atlas graph projection. */
function projectNode(
  id: string,
  data: DependencyGraphNodeData,
  repositories: ReadonlyMap<string, RepositoryGraphIdentity>
): GraphNode<PackageDependencyNodeData> {
  const repository = data.projectId === undefined ? undefined : repositories.get(data.projectId);
  const intrinsic = data.classification === 'intrinsic' || data.focus;
  const parent =
    repository === undefined
      ? data.kind === 'module'
        ? (data.parentPath ?? parentPackage(id))
        : parentPackage(id)
      : repositoryParentId(repository.id, data);
  const label = repository !== undefined && isRepositoryRoot(data) ? repository.label : data.label;

  return {
    id,
    data: {
      classification: data.classification,
      path: id,
      parent,
      label,
      name: label,
      ...(intrinsic ? { isIntrinsic: true } : {}),
      ...(data.kind === 'package' && data.focus ? { isWorkspaceRoot: true } : {}),
    },
  };
}

/*** Encode project-local owner nodes beneath their immutable repository identity. */
function repositoryPackageId(
  repositoryId: string,
  data: DependencyGraphNodeData
): string | undefined {
  const root = repositoryGraphId(repositoryId);
  if (isRepositoryRoot(data)) return root;
  const path = nonEmpty(data.path) ?? nonEmpty(data.packageName) ?? nonEmpty(data.label);
  if (path === undefined) return undefined;
  return `${root}.${data.kind}.${normalizeIdentityPath(path)}`;
}

/*** Keep compound depth relative to a repository rather than an installation directory. */
function repositoryParentId(repositoryId: string, data: DependencyGraphNodeData): string {
  const root = repositoryGraphId(repositoryId);
  if (isRepositoryRoot(data)) return '';
  const path = data.kind === 'module' ? data.parentPath : parentPackage(data.path ?? '');
  return path ? `${root}.${data.kind}.${normalizeIdentityPath(path)}` : root;
}

/*** Identify the canonical focus package that represents a selected repository itself. */
function isRepositoryRoot(data: DependencyGraphNodeData): boolean {
  return data.kind === 'package' && data.focus && (data.path === undefined || data.path === '.');
}

/*** Create an ID that is stable across checkout locations and repository renames. */
function repositoryGraphId(repositoryId: string): string {
  return `repository.${encodeURIComponent(repositoryId).replaceAll('.', '%2E')}`;
}

/*** Normalize semantic package paths without using temporary materialization paths. */
function normalizeIdentityPath(path: string): string {
  return path.replaceAll('/', '.').replace(/^\.+|\.+$/g, '');
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
