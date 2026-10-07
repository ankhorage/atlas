import { resolve } from 'node:path';

import type { DependencyGraph } from '@ankhorage/dependency-graph';
import type { ProjectInspection } from '@ankhorage/project-detector/types';

import { createProjectSnapshotReader } from '@/features/project-analysis/application/use-cases/createProjectSnapshotReader';
import { readProjectSnapshotAsync } from '@/features/project-analysis/composition/readProjectSnapshotAsync';
import type { ProjectSnapshot } from '@/types/projectAnalysis';

/*** Wires the filesystem reader to process-local in-flight sharing using normalized project paths. */
export function loadProjectSnapshotAsync(
  projectPath: string,
  dependencyGraph?: DependencyGraph,
  inspection?: ProjectInspection
): Promise<ProjectSnapshot> {
  const normalizedProjectPath = resolve(projectPath);
  return dependencyGraph === undefined
    ? reader.readAsync(normalizedProjectPath)
    : readProjectSnapshotAsync(normalizedProjectPath, dependencyGraph, inspection);
}

const reader = createProjectSnapshotReader({ readAsync: readProjectSnapshotAsync });
