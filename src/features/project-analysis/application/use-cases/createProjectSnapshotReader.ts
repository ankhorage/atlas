import type { ProjectSnapshot } from '@/types/projectAnalysis';

/***
 * Shares only in-flight analysis of the same normalized project path within one server process.
 * @performance
 * Graph, tree and audit must share the parsed files and graph, not independently scan the project.
 * Entries are removed after success or failure so later loads observe source changes and can retry.
 */
export function createProjectSnapshotReader(source: ProjectSnapshotSource) {
  const pending = new Map<string, Promise<ProjectSnapshot>>();

  /*** Joins the current project analysis or starts a fresh snapshot through the source port. */
  function readAsync(projectPath: string): Promise<ProjectSnapshot> {
    const current = pending.get(projectPath);
    if (current !== undefined) return current;

    const next = Promise.resolve()
      .then(() => source.readAsync(projectPath))
      .finally(() => pending.delete(projectPath));
    pending.set(projectPath, next);
    return next;
  }

  return { readAsync };
}

interface ProjectSnapshotSource {
  readonly readAsync: (projectPath: string) => Promise<ProjectSnapshot>;
}
