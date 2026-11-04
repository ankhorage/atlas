import {
  createSourceGraphFromProjectAnalysisSnapshots,
  type ProjectAnalysisSnapshot,
  projectDependencyGraphFromProjectAnalysisSnapshots,
} from '@ankhorage/dependency-graph';
import type { GitHubRepositoryDiscoveryRepository } from '@ankhorage/repository/github';

import { createAuditFromSnapshot } from '@/features/audit/application/use-cases/createAuditFromSnapshot';
import { projectDependencyGraph } from '@/features/dependency-analysis/application/use-cases/projectDependencyGraph';
import { buildProjectTree } from '@/features/project-tree/application/use-cases/buildProjectTree';
import { hydrateWorkspaceSnapshot } from '@/features/workspace/application/use-cases/hydrateWorkspaceSnapshot';
import type { ParserSelection } from '@/types/parserSelection';
import type { ProjectSnapshot } from '@/types/projectAnalysis';
import type { ProjectFileTree } from '@/types/projectFiles';
import type { WorkspaceLoadResult, WorkspaceRepositoryLoadStatus } from '@/types/workspace';

/*** Recompose the client-safe workspace view from retained portable repository analyses. */
export function composeWorkspaceRepositoryRuntimeResult(
  input: ComposeWorkspaceRepositoryRuntimeResultInput
): WorkspaceRepositoryRuntimeResult {
  const entries = selectedEntries(input.repositories, input.entries);
  if (entries.length === 0) return unavailableWorkspace(input);
  const analyses = entries.map(({ entry }) => entry.analysis);
  const sourceGraph = createSourceGraphFromProjectAnalysisSnapshots(analyses);
  const dependencyGraph = projectDependencyGraphFromProjectAnalysisSnapshots(sourceGraph, analyses);
  const snapshot = createWorkspaceProjectSnapshot(entries, sourceGraph, dependencyGraph);
  return {
    currentSource: input.source,
    projectName: entries.length === 1 ? entries[0].repository.name : 'GitHub workspace',
    repositoryStatuses: orderedStatuses(input.repositories, input.statuses),
    runtimeId: input.runtimeId,
    workspace: {
      ok: true,
      value: hydrateWorkspaceSnapshot({
        audit: createAuditFromSnapshot(
          snapshot,
          {},
          { workspaceIdentity: workspaceIdentity(entries) }
        ),
        navigationTree: navigationTree(entries),
        version: 1,
      }),
    },
  };
}

/*** Retain only analyses whose repository remains selected by the trusted server-side workspace. */
function selectedEntries(
  repositories: readonly GitHubRepositoryDiscoveryRepository[],
  entries: ReadonlyMap<string, RepositoryAnalysis>
): readonly RepositoryEntry[] {
  return repositories.flatMap(repository => {
    const entry = entries.get(repository.id);
    return entry === undefined ? [] : [{ entry, repository }];
  });
}

/*** Preserve the no-successful-project failure without disclosing runtime details. */
function unavailableWorkspace(
  input: ComposeWorkspaceRepositoryRuntimeResultInput
): WorkspaceRepositoryRuntimeResult {
  return {
    currentSource: input.source,
    projectName: 'GitHub workspace',
    repositoryStatuses: orderedStatuses(input.repositories, input.statuses),
    runtimeId: input.runtimeId,
    workspace: { ok: false, error: 'No selected GitHub repositories could be analyzed.' },
  };
}

/*** Build the canonical audit snapshot with global dependency topology and a representative file tree. */
function createWorkspaceProjectSnapshot(
  entries: readonly RepositoryEntry[],
  sourceGraph: ProjectSnapshot['sourceGraph'],
  dependencyGraph: Parameters<typeof projectDependencyGraph>[0]
): ProjectSnapshot {
  const [first] = entries;
  return {
    files: first.entry.files,
    language: first.entry.language,
    packageGraph: projectDependencyGraph(
      dependencyGraph,
      new Map(
        entries.map(({ repository }) => [
          repository.id,
          { id: repository.id, label: repository.name },
        ])
      )
    ),
    projectPath: '',
    sourceGraph,
    timeStart: Date.now(),
  };
}

/*** Create virtual owner and repository roots with identities stable across retries and revisions. */
function navigationTree(entries: readonly RepositoryEntry[]) {
  const owners = new Map<string, RepositoryEntry[]>();
  for (const entry of entries)
    owners.set(entry.repository.owner, [...(owners.get(entry.repository.owner) ?? []), entry]);
  return [...owners.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([owner, projects]) => ({
      children: projects
        .toSorted((left, right) => left.repository.name.localeCompare(right.repository.name))
        .map(({ repository, entry }) => ({
          children: prefixTree(buildProjectTree(entry.files), repository.id),
          graphPackage: repositoryGraphId(repository.id),
          id: `repository:${repository.id}`,
          kind: 'virtual' as const,
          label: repository.name,
        })),
      graphPackage: '',
      id: `owner:${owner}`,
      kind: 'virtual' as const,
      label: owner,
    }));
}

/*** Prefix cached project-tree graph references with their selected repository identity. */
function prefixTree(
  nodes: ReturnType<typeof buildProjectTree>,
  repositoryId: string
): ReturnType<typeof buildProjectTree> {
  return nodes.map(node => ({
    ...node,
    graphPackage:
      node.graphPackage === ''
        ? ''
        : `${repositoryGraphId(repositoryId)}.module.${node.graphPackage}`,
    ...(node.children ? { children: prefixTree(node.children, repositoryId) } : {}),
  }));
}

/*** Keep identity stable across provider rename and materialization location changes. */
function repositoryGraphId(repositoryId: string): string {
  return `repository.${encodeURIComponent(repositoryId).replaceAll('.', '%2E')}`;
}

/*** Keep browser preference scope stable when one failed repository becomes available. */
function workspaceIdentity(entries: readonly RepositoryEntry[]): string {
  return `workspace:${entries
    .map(({ repository }) => repository.id)
    .toSorted((left, right) => left.localeCompare(right))
    .join(',')}`;
}

/*** Render operation state in selected-repository order without exposing provider or filesystem failures. */
function orderedStatuses(
  repositories: readonly GitHubRepositoryDiscoveryRepository[],
  statuses: ReadonlyMap<string, WorkspaceRepositoryLoadStatus>
): readonly WorkspaceRepositoryLoadStatus[] {
  return repositories
    .map(repository => statuses.get(repository.id) ?? repositoryStatus(repository, 'failed'))
    .toSorted(
      (left, right) => Number(left.status === 'successful') - Number(right.status === 'successful')
    );
}

/*** Build a credential-free status record suitable for a browser response. */
function repositoryStatus(
  repository: GitHubRepositoryDiscoveryRepository,
  status: WorkspaceRepositoryLoadStatus['status']
): WorkspaceRepositoryLoadStatus {
  return {
    repository: { id: repository.id, name: repository.name, owner: repository.owner },
    status,
    ...(status === 'successful'
      ? {}
      : {
          description:
            status === 'cancelled'
              ? 'Loading was cancelled.'
              : 'Repository materialization failed.',
        }),
  };
}

export interface ComposeWorkspaceRepositoryRuntimeResultInput {
  readonly entries: ReadonlyMap<string, RepositoryAnalysis>;
  readonly repositories: readonly GitHubRepositoryDiscoveryRepository[];
  readonly runtimeId: string;
  readonly source: string;
  readonly statuses: ReadonlyMap<string, WorkspaceRepositoryLoadStatus>;
}

export interface RepositoryAnalysis {
  readonly analysis: ProjectAnalysisSnapshot;
  readonly files: ProjectFileTree;
  readonly language: ParserSelection;
}

interface RepositoryEntry {
  readonly entry: RepositoryAnalysis;
  readonly repository: GitHubRepositoryDiscoveryRepository;
}

export interface WorkspaceRepositoryRuntimeResult {
  readonly currentSource: string;
  readonly projectName: string;
  readonly repositoryStatuses: readonly WorkspaceRepositoryLoadStatus[];
  readonly runtimeId: string;
  readonly workspace: WorkspaceLoadResult;
}
