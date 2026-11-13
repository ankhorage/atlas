import { AtlasWorkspacePage } from '@/features/workspace/adapters/inbound/next/AtlasWorkspacePage';
import type { GitHubRepositoryAuthorization } from '@/features/github-auth/adapters/inbound/next/readGitHubAuthViewAsync';

import { loadFixtureWorkspaceAsync } from '../../fixtureWorkspace';

/*** Composes the real Atlas page with deterministic test-owned repository providers. */
export default async function FixturePage({ searchParams }: FixturePageProps) {
  return (
    <AtlasWorkspacePage loadWorkspace={loadFixtureWorkspace} searchParams={searchParams} />
  );
}

/*** Keep fixture discovery credential-free while satisfying the production server boundary. */
function loadFixtureWorkspace(source: string | undefined, _authorization: GitHubRepositoryAuthorization) {
  return loadFixtureWorkspaceAsync(source);
}

interface FixturePageProps {
  readonly searchParams: Promise<{
    readonly source?: string | readonly string[];
    readonly repositories?: string | readonly string[];
    readonly workspace?: string | readonly string[];
  }>;
}
