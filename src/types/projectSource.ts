export type ProjectSource =
  | { readonly kind: 'filesystem'; readonly path: string }
  | { readonly kind: 'github'; readonly url: string };

export interface ResolvedProjectSource {
  readonly rootPath: string;
  readonly projectName: string;
  readonly source: ProjectSource;
  readonly revision?: string;
  readonly cleanupAsync: () => Promise<void>;
}

interface GitHubProjectMaterialization {
  readonly rootPath: string;
  readonly projectName: string;
  readonly revision: string;
  readonly cleanupAsync: () => Promise<void>;
}

export interface GitHubProjectMaterializer {
  readonly materializeAsync: (
    source: Extract<ProjectSource, { readonly kind: 'github' }>
  ) => Promise<GitHubProjectMaterialization>;
}
