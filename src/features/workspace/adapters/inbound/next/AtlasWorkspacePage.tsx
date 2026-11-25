import { TONE_PAIR_CATALOG } from '@ankhorage/templates';
import type { ColorToneDefinition } from '@ankhorage/zora';
import { connection } from 'next/server';

import { downloadAuditJsonAction, downloadAuditXmlAction } from '@/app/actions/audit.actions';
import {
  type GitHubRepositoryAuthorization,
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
  const source = readSource(params);
  const repositoryIds = readRepositoryIds(readSearchParam(params.repositories));
  const result =
    readSearchParam(params.cache) === '1' && source !== undefined && repositoryIds.length > 0
      ? await loadWorkspace(undefined, repositoryAuthentication)
      : await loadWorkspace(
          withRepositorySelection(source, readSearchParam(params.repositories)),
          repositoryAuthentication
        );

  return (
    <WorkspaceView
      auditExportActions={{
        downloadJson: downloadAuditJsonAction,
        downloadXml: downloadAuditXmlAction,
      }}
      currentSource={source ?? result.currentSource}
      githubAuth={githubAuth}
      initialSelectedRepositoryIds={repositoryIds}
      projectName={result.projectName}
      repositories={result.repositories}
      repositoryStatuses={result.repositoryStatuses}
      repositoryColorTones={createColorToneDefinitions(TONE_PAIR_CATALOG)}
      runtimeId={result.runtimeId}
      selectionRequired={result.selectionRequired}
      workspaceScope={readSearchParam(params.workspace)}
      workspace={result.workspace}
    />
  );
}

function readSource(params: Awaited<AtlasWorkspacePageProps['searchParams']>): string | undefined {
  const example = readSearchParam(params.example);
  if (example === 'java' || example === 'typescript') return `example:${example}`;
  return readSearchParam(params.source);
}

function readRepositoryIds(value: string | undefined): readonly string[] {
  if (value === undefined) return [];
  return value
    .split(',')
    .filter(id => id.length > 0 && id.length <= 256)
    .toSorted();
}

/*** Select the serializable Tone props required by ZORA from the published Templates catalog. */
function createColorToneDefinitions(
  catalog: typeof TONE_PAIR_CATALOG
): readonly ColorToneDefinition[] {
  return catalog.map(({ accent, accentTarget, id }) => ({ accent, accentTarget, id }));
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
    readonly example?: string | readonly string[];
    readonly cache?: string | readonly string[];
    readonly repositories?: string | readonly string[];
    readonly workspace?: string | readonly string[];
  }>;
}
