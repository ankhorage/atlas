import path from 'node:path';

import { findCyclePath, findCyclicComponents } from '@ankhorage/graph';

import type {
  CycleEdgeEvidence,
  CycleProject,
  ImportEvidence,
  PackageCycleDetail,
} from '@/types/audit';
import type { PackageDependencyGraph } from '@/types/dependencyAnalysis';
import type { ProjectFileMetadata, ProjectFileTree } from '@/types/projectFiles';

/*** Detect package cycles directly on the canonical package projection and retain owner evidence. */
export function getPackageCyclesWithMembers(
  files: ProjectFileTree,
  graph: PackageDependencyGraph
): {
  cycles: PackageCycleDetail[];
  packageSet: Set<TUniquePackageName>;
  graph: PackageDependencyGraph;
} {
  const cycleGraph = addPackageContainmentEdges(graph);
  const sccs = findCyclicComponents(cycleGraph);
  const fileMetadata = collectFiles(files);
  const cycles: PackageCycleDetail[] = [];
  const packageSet = new Set<TUniquePackageName>();

  for (const scc of sccs) {
    scc.forEach(packageName => packageSet.add(packageName));
    const cycle = [...(findCyclePath(cycleGraph, scc) ?? [...scc, scc[0]])];
    cycles.push({
      packages: cycle,
      displayPackages: cycle.map(
        packageId => cycleGraph.nodes.find(node => node.id === packageId)?.data.label ?? packageId
      ),
      projects: getCycleProjects(cycleGraph, cycle),
      edges: cycle
        .slice(0, -1)
        .map((from, index) => cycleEdgeEvidence(cycleGraph, fileMetadata, from, cycle[index + 1])),
    });
  }

  return { cycles, packageSet, graph };
}

/*** Add canonical package hierarchy relations only for audit cycle traversal, not graph rendering. */
function addPackageContainmentEdges(graph: PackageDependencyGraph): PackageDependencyGraph {
  const nodeIds = new Set(graph.nodes.map(node => node.id));
  const containmentEdges = graph.nodes.flatMap(node => {
    const { parent } = node.data;
    if (parent === '' || !nodeIds.has(parent)) return [];
    const id = `${parent}->${node.id}`;
    return graph.edges.some(edge => edge.id === id)
      ? []
      : [{ data: { evidence: [], weight: 1 }, id, source: parent, target: node.id }];
  });
  return { edges: [...graph.edges, ...containmentEdges], nodes: graph.nodes };
}

/*** Resolve repository ownership from canonical graph metadata, not presentation identities. */
function getCycleProjects(
  graph: PackageDependencyGraph,
  packages: readonly string[]
): readonly CycleProject[] {
  const projects = new Map<string, CycleProject>();
  for (const packageId of packages) {
    const data = graph.nodes.find(node => node.id === packageId)?.data;
    if (data?.repositoryId !== undefined && data.repositoryLabel !== undefined) {
      projects.set(data.repositoryId, { id: data.repositoryId, label: data.repositoryLabel });
    }
  }
  return [...projects.values()].toSorted((left, right) => left.id.localeCompare(right.id));
}

type TUniquePackageName = string;

/*** Collect project file metadata without consulting dependency metadata stored on the files. */
function collectFiles(root: ProjectFileTree): readonly ProjectFileMetadata[] {
  return Object.values(root).flatMap(entry =>
    isProjectFileMetadata(entry) ? [entry] : collectFiles(entry)
  );
}

/*** Distinguish project file metadata from recursive directory records. */
function isProjectFileMetadata(
  entry: ProjectFileTree | ProjectFileMetadata
): entry is ProjectFileMetadata {
  return 'path' in entry && typeof entry.path === 'string' && 'package' in entry;
}

/*** Project canonical edge evidence into the audit contract for one cycle step. */
function cycleEdgeEvidence(
  graph: PackageDependencyGraph,
  files: readonly ProjectFileMetadata[],
  from: string,
  to: string
): CycleEdgeEvidence {
  const edge = graph.edges.find(candidate => candidate.source === from && candidate.target === to);
  return {
    from,
    to,
    via: edge?.data.evidence.map(evidence => projectImportEvidence(files, evidence)) ?? [],
  };
}

/*** Add Atlas file identity to one canonical dependency evidence item. */
function projectImportEvidence(
  files: readonly ProjectFileMetadata[],
  evidence: PackageDependencyGraph['edges'][number]['data']['evidence'][number]
): ImportEvidence {
  const file = findProjectFile(files, evidence.sourceFile);
  const filePath = file?.path ?? evidence.sourceFile;
  return {
    filePath,
    fileClass: file?.className ?? path.basename(filePath, path.extname(filePath)),
    importName: evidence.specifier,
    isIntrinsic: evidence.classification === 'intrinsic' || evidence.classification === 'focus',
  };
}

/*** Match owner-relative dependency evidence to Atlas file metadata. */
function findProjectFile(
  files: readonly ProjectFileMetadata[],
  sourceFile: string
): ProjectFileMetadata | undefined {
  return files.find(file => sourceFile === file.path || sourceFile.endsWith(`/${file.path}`));
}
