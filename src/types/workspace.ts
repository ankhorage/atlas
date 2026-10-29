import type { Audit } from '@/types/audit';
import type { PackageDependencyGraph } from '@/types/dependencyAnalysis';
import type { ProjectTreeNode } from '@/types/projectTree';

export interface ProjectOverview {
  readonly packageGraph: PackageDependencyGraph;
  readonly projectIdentity: string;
  readonly tree: readonly ProjectTreeNode[];
  readonly evaluation: Audit['evaluation'];
}

/** A portable Atlas-owned workspace payload for an online or embedded host. */
export interface WorkspaceSnapshot {
  readonly version: 1;
  readonly audit: Audit;
}

export type WorkspaceLoadResult =
  | { readonly ok: true; readonly value: ProjectOverview }
  | { readonly ok: false; readonly error: string };
