import {
  createSourceGraphFromInspectionsAsync,
  projectDependencyGraphFromInspections,
} from '@ankhorage/dependency-graph';

import { projectDependencyGraph } from '@/features/dependency-analysis/application/use-cases/projectDependencyGraph';
import { inspectProjectForAnalysisAsync } from '@/features/project-analysis/adapters/outbound/project-detector/inspectProjectForAnalysisAsync';
import { selectParserLanguage } from '@/features/project-analysis/application/use-cases/selectParserLanguage';
import { createProjectFileTreeAsync } from '@/features/project-analysis/composition/createProjectFileTreeAsync';
import type { ProjectSnapshot } from '@/types/projectAnalysis';

/*** Read one project inspection and derive Tree metadata plus the canonical package graph. */
export async function readProjectSnapshotAsync(projectPath: string): Promise<ProjectSnapshot> {
  const timeStart = Date.now();
  const inspection = await inspectProjectForAnalysisAsync(projectPath);
  const projects = [{ id: 'current', inspection }];
  const sourceGraph = await createSourceGraphFromInspectionsAsync({ projects });
  const dependencyGraph = projectDependencyGraphFromInspections(sourceGraph, projects);
  const language = selectParserLanguage(inspection.detection);
  const files = await createProjectFileTreeAsync(
    inspection,
    dependencyGraph,
    language.language,
    projectPath
  );
  const packageGraph = projectDependencyGraph(dependencyGraph);

  return { files, packageGraph, language, projectPath, timeStart };
}
