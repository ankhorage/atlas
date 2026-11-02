import {
  createSourceGraphFromInspectionsAsync,
  projectDependencyGraphFromInspections,
} from '@ankhorage/dependency-graph';
import type { GitHubRepositoryDiscoveryRepository } from '@ankhorage/repository/github';
import { toErrorMessage } from '@ankhorage/utility/error';

import { createAuditFromSnapshot } from '@/features/audit/application/use-cases/createAuditFromSnapshot';
import { projectDependencyGraph } from '@/features/dependency-analysis/application/use-cases/projectDependencyGraph';
import { inspectProjectForAnalysisAsync } from '@/features/project-analysis/adapters/outbound/project-detector/inspectProjectForAnalysisAsync';
import { loadProjectSnapshotAsync } from '@/features/project-analysis/composition/loadProjectSnapshotAsync';
import { buildProjectTree } from '@/features/project-tree/application/use-cases/buildProjectTree';
import { hydrateWorkspaceSnapshot } from '@/features/workspace/application/use-cases/hydrateWorkspaceSnapshot';
import { settleBoundedAsync } from '@/features/workspace/utils/settleBoundedAsync';
import type { ProjectSnapshot } from '@/types/projectAnalysis';
import type { ResolvedProjectSource } from '@/types/projectSource';
import type { ProjectTreeNode } from '@/types/projectTree';
import type { WorkspaceLoadResult } from '@/types/workspace';
import type { WorkspaceRepositoryLoadStatus } from '@/types/workspace';

/*** Analyze selected repositories together through the canonical multi-project dependency pipeline. */
export async function loadMultiProjectWorkspaceAsync(
  projects: readonly MultiProjectWorkspaceProject[],
  signal?: AbortSignal
): Promise<MultiProjectWorkspaceLoadResult> {
  try {
    if (projects.length === 0) throw new Error('No GitHub repositories are selected.');
    const inspection = await inspectWorkspaceProjectsAsync(projects, signal);
    const { projects: inspected } = inspection;
    if (inspected.length === 0)
      throw new Error('No selected GitHub repositories could be analyzed.');
    const graphProjects = inspected.map(({ id, inspection }) => ({ id, inspection }));
    const sourceGraph = await createSourceGraphFromInspectionsAsync({ projects: graphProjects });
    const dependencyGraph = projectDependencyGraphFromInspections(sourceGraph, graphProjects);
    const snapshotLoading = await loadWorkspaceSnapshotsAsync(inspected, dependencyGraph, signal);
    const { projects: snapshots } = snapshotLoading;
    if (snapshots.length === 0) throw new Error('No selected GitHub repositories could be loaded.');
    const snapshot = createMultiProjectSnapshot(snapshots, sourceGraph, dependencyGraph);
    return {
      workspace: {
        ok: true,
        value: hydrateWorkspaceSnapshot({
          audit: createAuditFromSnapshot(
            snapshot,
            {},
            {
              workspaceIdentity: createWorkspaceIdentity(snapshots),
            }
          ),
          navigationTree: createMultiProjectNavigationTree(snapshots),
          version: 1,
        }),
      },
      repositoryStatuses: [...inspection.statuses, ...snapshotLoading.statuses],
    };
  } catch (error) {
    return {
      workspace: {
        ok: false,
        error: toErrorMessage(error, 'Unable to load selected GitHub repositories.'),
      },
      repositoryStatuses: [],
    };
  }
}

/*** Scope browser preferences to stable selected repository identities, independent of ordering. */
function createWorkspaceIdentity(snapshots: readonly InspectedWorkspaceSnapshot[]): string {
  return `workspace:${snapshots
    .map(({ project }) => project.repository.id)
    .toSorted((left, right) => left.localeCompare(right))
    .join(',')}`;
}

/*** Inspect selected repositories independently so one unavailable project does not blank the workspace. */
async function inspectWorkspaceProjectsAsync(
  projects: readonly MultiProjectWorkspaceProject[],
  signal?: AbortSignal
): Promise<RepositoryOutcomeCollection<InspectedWorkspaceProject>> {
  const outcomes = await settleBoundedAsync(
    projects,
    MAX_CONCURRENT_REPOSITORY_ANALYSES,
    async project => ({
      id: project.repository.id,
      inspection: await inspectProjectForAnalysisAsync(project.resolved.rootPath),
      project,
    }),
    signal
  );
  return collectRepositoryOutcomes(
    projects.map(project => ({ project })),
    outcomes,
    'analysis'
  );
}

/*** Read successful project snapshots independently after the shared dependency graph is available. */
async function loadWorkspaceSnapshotsAsync(
  inspected: readonly InspectedWorkspaceProject[],
  dependencyGraph: Parameters<typeof projectDependencyGraph>[0],
  signal?: AbortSignal
): Promise<RepositoryOutcomeCollection<InspectedWorkspaceSnapshot>> {
  const outcomes = await settleBoundedAsync(
    inspected,
    MAX_CONCURRENT_REPOSITORY_ANALYSES,
    async ({ inspection, project }) => ({
      project,
      snapshot: await loadProjectSnapshotAsync(
        project.resolved.rootPath,
        dependencyGraph,
        inspection
      ),
    }),
    signal
  );
  return collectRepositoryOutcomes(inspected, outcomes, 'snapshot');
}

/*** Preserve successful work while describing the exact selected repositories that could not continue. */
function collectRepositoryOutcomes<
  Input extends { readonly project: MultiProjectWorkspaceProject },
  Output,
>(
  projects: readonly Input[],
  outcomes: readonly PromiseSettledResult<Output>[],
  phase: 'analysis' | 'snapshot'
): RepositoryOutcomeCollection<Output> {
  const successful: Output[] = [];
  const statuses: WorkspaceRepositoryLoadStatus[] = [];
  const projectIterator = projects.values();
  for (const outcome of outcomes) {
    const nextProject = projectIterator.next();
    if (nextProject.done) break;
    const { project } = nextProject.value;
    if (outcome.status === 'fulfilled') {
      successful.push(outcome.value);
      if (phase === 'snapshot') statuses.push(createRepositoryLoadStatus(project, 'successful'));
      continue;
    }
    statuses.push(
      createRepositoryLoadStatus(
        project,
        isCancellation(outcome.reason) ? 'cancelled' : 'failed',
        phase
      )
    );
  }
  return { projects: successful, statuses };
}

/*** Render cancellation separately from failures without exposing provider exception text or local paths. */
function isCancellation(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

/*** Create a stable, credential-free UI status for one repository loading stage. */
function createRepositoryLoadStatus(
  project: MultiProjectWorkspaceProject,
  status: WorkspaceRepositoryLoadStatus['status'],
  phase?: 'analysis' | 'snapshot'
): WorkspaceRepositoryLoadStatus {
  return {
    repository: {
      id: project.repository.id,
      name: project.repository.name,
      owner: project.repository.owner,
    },
    status,
    ...(status === 'successful'
      ? {}
      : {
          description:
            status === 'cancelled'
              ? 'Loading was cancelled.'
              : phase === 'analysis'
                ? 'Repository analysis failed.'
                : 'Repository snapshot loading failed.',
        }),
  };
}

/*** Merge display trees while preserving each repository as an explicit virtual root. */
function createMultiProjectSnapshot(
  snapshots: readonly InspectedWorkspaceSnapshot[],
  sourceGraph: ProjectSnapshot['sourceGraph'],
  dependencyGraph: Parameters<typeof projectDependencyGraph>[0]
): ProjectSnapshot {
  const first = snapshots.at(0)?.snapshot;
  if (first === undefined) throw new Error('No project snapshots were available.');
  const repositories = new Map(
    snapshots.map(({ project }) => [
      project.repository.id,
      { id: project.repository.id, label: project.repository.name },
    ])
  );
  return {
    ...first,
    packageGraph: projectDependencyGraph(dependencyGraph, repositories),
    sourceGraph,
  };
}

/*** Build virtual GitHub owner and repository rows around unchanged project file trees. */
function createMultiProjectNavigationTree(
  snapshots: readonly InspectedWorkspaceSnapshot[]
): readonly ProjectTreeNode[] {
  const owners = new Map<string, InspectedWorkspaceSnapshot[]>();
  for (const snapshot of snapshots) {
    const grouped = owners.get(snapshot.project.repository.owner) ?? [];
    owners.set(snapshot.project.repository.owner, [...grouped, snapshot]);
  }
  return [...owners.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([owner, projects]) => ({
      id: `owner:${owner}`,
      kind: 'virtual' as const,
      label: owner,
      graphPackage: '',
      children: projects
        .toSorted((left, right) =>
          left.project.repository.name.localeCompare(right.project.repository.name)
        )
        .map(({ project, snapshot }) => ({
          id: `repository:${project.repository.id}`,
          kind: 'virtual' as const,
          label: project.repository.name,
          graphPackage: repositoryGraphId(project.repository.id),
          children: prefixProjectTree(buildProjectTree(snapshot.files), project.repository.id),
        })),
    }));
}

/*** Translate only local graph-package references into their repository-scoped graph identities. */
function prefixProjectTree(
  nodes: readonly ProjectTreeNode[],
  repositoryId: string
): readonly ProjectTreeNode[] {
  return nodes.map(node => ({
    ...node,
    graphPackage:
      node.graphPackage === ''
        ? ''
        : `${repositoryGraphId(repositoryId)}.module.${node.graphPackage}`,
    ...(node.children ? { children: prefixProjectTree(node.children, repositoryId) } : {}),
  }));
}

/*** Keep repository grouping IDs independent from owner/repository display names and checkout paths. */
function repositoryGraphId(repositoryId: string): string {
  return `repository.${encodeURIComponent(repositoryId).replaceAll('.', '%2E')}`;
}

export interface MultiProjectWorkspaceProject {
  readonly repository: GitHubRepositoryDiscoveryRepository;
  readonly resolved: ResolvedProjectSource;
}

interface InspectedWorkspaceProject {
  readonly id: string;
  readonly inspection: Awaited<ReturnType<typeof inspectProjectForAnalysisAsync>>;
  readonly project: MultiProjectWorkspaceProject;
}

interface InspectedWorkspaceSnapshot {
  readonly project: MultiProjectWorkspaceProject;
  readonly snapshot: ProjectSnapshot;
}

interface MultiProjectWorkspaceLoadResult {
  readonly repositoryStatuses: readonly WorkspaceRepositoryLoadStatus[];
  readonly workspace: WorkspaceLoadResult;
}

interface RepositoryOutcomeCollection<Output> {
  readonly projects: readonly Output[];
  readonly statuses: readonly WorkspaceRepositoryLoadStatus[];
}

const MAX_CONCURRENT_REPOSITORY_ANALYSES = 4;
