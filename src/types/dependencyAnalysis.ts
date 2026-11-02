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
  /** Immutable selected-repository identity, absent for unscoped single-project nodes. */
  readonly repositoryId?: string;
  /** Canonical repository metadata for audit presentation, never a checkout path. */
  readonly repositoryLabel?: string;
}

/** Stable Atlas presentation identity for one repository-backed analysis project. */
export interface RepositoryGraphIdentity {
  readonly id: string;
  readonly label: string;
}

export interface PackageDependencyEdgeData extends Readonly<Record<string, unknown>> {
  readonly weight: number;
  readonly evidence: readonly DependencyImportEvidence[];
}

export type PackageDependencyGraph = Graph<PackageDependencyNodeData, PackageDependencyEdgeData>;
