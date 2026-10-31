import type {
  DependencyImportEvidence,
  DependencyNodeClassification,
} from '@ankhorage/dependency-graph';
import type { Graph } from '@ankhorage/graph';

export interface PackageDependencyNodeData extends Readonly<Record<string, unknown>> {
  readonly classification: DependencyNodeClassification;
  readonly path: string;
  readonly parent: string;
  readonly label: string;
  readonly name: string;
  readonly isIntrinsic?: boolean;
  readonly isWorkspaceRoot?: boolean;
}

export interface PackageDependencyEdgeData extends Readonly<Record<string, unknown>> {
  readonly weight: number;
  readonly evidence: readonly DependencyImportEvidence[];
}

export type PackageDependencyGraph = Graph<PackageDependencyNodeData, PackageDependencyEdgeData>;
