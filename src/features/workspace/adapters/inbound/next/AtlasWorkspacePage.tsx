import { connection } from 'next/server';

import { downloadAuditJsonAction, downloadAuditXmlAction } from '@/app/actions/audit.actions';
import { WorkspaceView } from '@/features/workspace/adapters/inbound/react/WorkspaceView';
import type { WorkspaceProjectSourceResult } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

/*** Renders the real Atlas workspace page from an explicitly composed server-side loader. */
export async function AtlasWorkspacePage({ loadWorkspace, searchParams }: AtlasWorkspacePageProps) {
  await connection();
  const params = await searchParams;
  const result = await loadWorkspace(readSearchParam(params.source));

  return (
    <WorkspaceView
      auditExportActions={{
        downloadJson: downloadAuditJsonAction,
        downloadXml: downloadAuditXmlAction,
      }}
      currentSource={result.currentSource}
      projectName={result.projectName}
      repositories={result.repositories}
      repositoryStatuses={result.repositoryStatuses}
      workspaceScope={readSearchParam(params.workspace)}
      workspace={result.workspace}
    />
  );
}

/*** Read one scalar search parameter while ignoring repeated values. */
function readSearchParam(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

interface AtlasWorkspacePageProps {
  readonly loadWorkspace: (source: string | undefined) => Promise<WorkspaceProjectSourceResult>;
  readonly searchParams: Promise<{
    readonly source?: string | readonly string[];
    readonly workspace?: string | readonly string[];
  }>;
}
