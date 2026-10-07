import { connection } from 'next/server';

import { requestDependencyGraphAsync } from '@/features/dependency-analysis/adapters/outbound/api/requestDependencyGraphAsync';
import { WorkspaceView } from '@/features/workspace/adapters/inbound/react/WorkspaceView';
import { loadWorkspaceProjectSourceAsync } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

/***
 * Loads one workspace per page request rather than starting analysis from client mount effects.
 * @performance Keep this request-time read dynamic: build-time or persistent caching would hide
 * source edits. Client Strict Mode rendering must not trigger another filesystem analysis.
 */
export default async function Home({ searchParams }: HomeProps) {
  await connection();
  const params = await searchParams;
  const source = readSearchParam(params.source);
  const result = await loadWorkspaceProjectSourceAsync(source, inspection =>
    requestDependencyGraphAsync(inspection)
  );

  return (
    <WorkspaceView
      currentSource={result.currentSource}
      projectName={result.projectName}
      workspace={result.workspace}
    />
  );
}

/*** Read one scalar search parameter while ignoring repeated values. */
function readSearchParam(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

interface HomeProps {
  readonly searchParams: Promise<{
    readonly source?: string | readonly string[];
  }>;
}
