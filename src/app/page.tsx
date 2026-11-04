import { requestDependencyGraphAsync } from '@/features/dependency-analysis/adapters/outbound/api/requestDependencyGraphAsync';
import { AtlasWorkspacePage } from '@/features/workspace/adapters/inbound/next/AtlasWorkspacePage';
import { loadWorkspaceProjectSourceAsync } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

/*** Composes the production Atlas page with its canonical dependency-graph adapter. */
export default function Home({ searchParams }: HomeProps) {
  return <AtlasWorkspacePage loadWorkspace={loadWorkspace} searchParams={searchParams} />;
}

/*** Binds the production page to the trusted in-process dependency graph action. */
function loadWorkspace(source: string | undefined) {
  return loadWorkspaceProjectSourceAsync(source, requestDependencyGraphAsync);
}

interface HomeProps {
  readonly searchParams: Promise<{
    readonly source?: string | readonly string[];
    readonly workspace?: string | readonly string[];
  }>;
}
