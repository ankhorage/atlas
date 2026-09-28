import type { ProjectSnapshot, ProjectSnapshotRequest } from '@/types/projectAnalysis';

/***
 * Shares only in-flight analysis of the same normalized project path within one server process.
 * @performance
 * Graph, tree and audit must share the parsed files and graph, not independently scan the project.
 * Entries are removed after success or failure so later loads observe source changes and can retry.
 */
export function createProjectSnapshotReader(source: ProjectSnapshotSource) {
  const pending = new Map<string, Promise<ProjectSnapshot>>();

  /*** Joins the current project analysis or starts a fresh snapshot through the source port. */
  function readAsync(input: ProjectSnapshotRequest): Promise<ProjectSnapshot> {
    const key = inspectionScopeKey(input);
    const current = pending.get(key);
    if (current !== undefined) return current;

    const next = Promise.resolve()
      .then(() => source.readAsync(input))
      .finally(() => pending.delete(key));
    pending.set(key, next);
    return next;
  }

  return { readAsync };
}

interface ProjectSnapshotSource {
  readonly readAsync: (input: ProjectSnapshotRequest) => Promise<ProjectSnapshot>;
}

/*** Create a deterministic in-flight cache key that includes the selected inspection scope. */
function inspectionScopeKey(input: ProjectSnapshotRequest): string {
  return JSON.stringify([input.projectPath, input.excludePaths ?? []]);
}
