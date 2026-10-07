import type { DependencyGraph } from '@ankhorage/dependency-graph';
import {
  createSourceGraphFromInspectionsAsync,
  projectDependencyGraphFromInspections,
} from '@ankhorage/dependency-graph';
import type { ProjectInspection } from '@ankhorage/project-detector/types';

import { projectDependencyGraph } from '@/features/dependency-analysis/application/use-cases/projectDependencyGraph';
import { inspectProjectForAnalysisAsync } from '@/features/project-analysis/adapters/outbound/project-detector/inspectProjectForAnalysisAsync';
import { selectParserLanguage } from '@/features/project-analysis/application/use-cases/selectParserLanguage';
import { createProjectFileTreeAsync } from '@/features/project-analysis/composition/createProjectFileTreeAsync';
import type { ProjectSnapshot } from '@/types/projectAnalysis';

/*** Read one project inspection and retain its canonical SourceGraph plus derived package view. */
export async function readProjectSnapshotAsync(
  projectPath: string,
  dependencyGraph?: DependencyGraph,
  suppliedInspection?: ProjectInspection
): Promise<ProjectSnapshot> {
  const timeStart = Date.now();
  const inspection = suppliedInspection ?? (await inspectProjectForAnalysisAsync(projectPath));
  const projects = [{ id: 'current', inspection }];
  const sourceGraph = await createSourceGraphFromInspectionsAsync({ projects });
  const resolvedDependencyGraph =
    dependencyGraph ?? projectDependencyGraphFromInspections(sourceGraph, projects);
  const language = selectParserLanguage(inspection.detection);
  const files = await createProjectFileTreeAsync(
    inspection,
    resolvedDependencyGraph,
    language.language,
    projectPath
  );
  const packageGraph = projectDependencyGraph(resolvedDependencyGraph);

  return { files, packageGraph, sourceGraph, language, projectPath, timeStart };
}
