import { resolve } from 'node:path';

import { createProjectSnapshotReader } from '@/features/project-analysis/application/use-cases/createProjectSnapshotReader';
import { readProjectSnapshotAsync } from '@/features/project-analysis/composition/readProjectSnapshotAsync';
import type { ProjectAnalysisOptions, ProjectSnapshot } from '@/types/projectAnalysis';

/*** Wires the filesystem reader to process-local in-flight sharing using normalized project paths. */
export function loadProjectSnapshotAsync(
  projectPath: string,
  analysisOptions: ProjectAnalysisOptions = {}
): Promise<ProjectSnapshot> {
  return reader.readAsync({ projectPath: resolve(projectPath), ...analysisOptions });
}

const reader = createProjectSnapshotReader({ readAsync: readProjectSnapshotAsync });
