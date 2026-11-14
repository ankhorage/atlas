import { connection } from 'next/server';

import { downloadAuditJsonAction, downloadAuditXmlAction } from '@/app/actions/audit.actions';
import type { GitHubRepositoryAuthorization } from '@/features/github-auth/adapters/inbound/next/readGitHubAuthViewAsync';
import {
  readGitHubAuthViewAsync,
  readGitHubRepositoryAuthenticationAsync,
} from '@/features/github-auth/adapters/inbound/next/readGitHubAuthViewAsync';
import { WorkspaceView } from '@/features/workspace/adapters/inbound/react/WorkspaceView';
import type { WorkspaceProjectSourceResult } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

/*** Renders the real Atlas workspace page from an explicitly composed server-side loader. */
export async function AtlasWorkspacePage({ loadWorkspace, searchParams }: AtlasWorkspacePageProps) {
  await connection();
  const params = await searchParams;
  const [githubAuth, repositoryAuthentication] = await Promise.all([
    readGitHubAuthViewAsync(),
    readGitHubRepositoryAuthenticationAsync(),
  ]);
  const result = await loadWorkspace(
    withRepositorySelection(
      authenticatedInventorySource(
        readSearchParam(params.source),
        repositoryAuthentication.authentication
      ),
      readSearchParam(params.repositories)
    ),
    repositoryAuthentication
  );

  return (
    <WorkspaceView
      auditExportActions={{
        downloadJson: downloadAuditJsonAction,
        downloadXml: downloadAuditXmlAction,
      }}
      currentSource={result.currentSource}
      githubAuth={githubAuth}
      projectName={result.projectName}
      repositories={result.repositories}
      repositoryStatuses={result.repositoryStatuses}
      runtimeId={result.runtimeId}
      selectionRequired={result.selectionRequired}
      workspaceScope={readSearchParam(params.workspace)}
      workspace={result.workspace}
    />
  );
}

/*** Open the current user's inventory after sign-in while anonymous visitors retain public-owner discovery. */
function authenticatedInventorySource(
  source: string | undefined,
  authentication: GitHubRepositoryAuthorization['authentication']
): string | undefined {
  return source ?? (authentication === 'anonymous' ? undefined : '@me');
}

/*** Read one scalar search parameter while ignoring repeated values. */
function readSearchParam(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/*** Keep repository ids in an explicit query field while the server validates them against discovery. */
function withRepositorySelection(
  source: string | undefined,
  repositories: string | undefined
): string | undefined {
  if (source === undefined || repositories === undefined || source.includes('|')) return source;
  return `${source}|include=${repositories}`;
}

interface AtlasWorkspacePageProps {
  readonly loadWorkspace: (
    source: string | undefined,
    authorization: GitHubRepositoryAuthorization
  ) => Promise<WorkspaceProjectSourceResult>;
  readonly searchParams: Promise<{
    readonly source?: string | readonly string[];
    readonly repositories?: string | readonly string[];
    readonly workspace?: string | readonly string[];
  }>;
}
