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
  readonly navigationTree?: readonly ProjectTreeNode[];
}

export type WorkspaceLoadResult =
  | { readonly ok: true; readonly value: ProjectOverview }
  | { readonly ok: false; readonly error: string };

/*** Describes the transient outcome of loading one selected repository without changing its saved definition. */
export interface WorkspaceRepositoryLoadStatus {
  readonly description?: string;
  readonly repository: WorkspaceRepositoryIdentity;
  readonly status: 'cancelled' | 'failed' | 'successful';
}

/*** Keeps repository presentation identity independent from checkout paths and provider response details. */
interface WorkspaceRepositoryIdentity {
  readonly id: string;
  readonly name: string;
  readonly owner: string;
}

/** A user-named, browser-portable description of a GitHub workspace. */
export interface WorkspaceDefinition {
  readonly version: 1;
  readonly id: string;
  readonly name: string;
  readonly sources: readonly WorkspaceSource[];
  readonly settings: WorkspacePresentationSettings;
}

/** Preserve owner-wide inclusion independently from explicit repository selections. */
export type WorkspaceSource =
  | {
      readonly kind: 'github-owner';
      readonly owner: string;
      readonly excludedRepositoryIds: readonly string[];
    }
  | { readonly kind: 'github-repository'; readonly repositoryId: string; readonly url: string };

/** Persist only graph presentation choices; analysis data belongs in the revision cache. */
export interface WorkspacePresentationSettings {
  readonly dependencyPrefix: string;
  readonly dependencyKinds: readonly ('runtime' | 'dev' | 'peer' | 'optional')[];
  readonly showCompoundNodes: boolean;
  readonly showVendorPackages: boolean;
  readonly subPackageDepth: number;
  readonly layout: string;
  readonly spacing: number;
}

/** Immutable identity for a safely reusable public GitHub analysis. */
export interface WorkspaceAnalysisCacheKey {
  readonly authorization: 'anonymous';
  readonly provider: 'github';
  readonly repositoryId: string;
  readonly revision: string;
  readonly schemaVersion: number;
}
