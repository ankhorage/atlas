import type { PackageDependencyGraph } from '@/types/dependencyAnalysis';
import type { ParserSelection } from '@/types/parserSelection';
import type { ProjectFileTree } from '@/types/projectFiles';

/** Generic project-relative paths that an analysis caller intentionally leaves outside its scope. */
export interface ProjectAnalysisOptions {
  readonly excludePaths?: readonly string[];
}

export interface ProjectSnapshotRequest extends ProjectAnalysisOptions {
  readonly projectPath: string;
}

export interface ProjectSnapshot {
  readonly files: ProjectFileTree;
  readonly packageGraph: PackageDependencyGraph;
  readonly language: ParserSelection;
  readonly projectPath: string;
  readonly timeStart: number;
}
