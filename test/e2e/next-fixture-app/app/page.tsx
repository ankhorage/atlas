import { AtlasWorkspacePage } from '@/features/workspace/adapters/inbound/next/AtlasWorkspacePage';

import { loadFixtureWorkspaceAsync } from '../../fixtureWorkspace';

/*** Composes the real Atlas page with deterministic test-owned repository providers. */
export default async function FixturePage({ searchParams }: FixturePageProps) {
  return (
    <AtlasWorkspacePage loadWorkspace={loadFixtureWorkspaceAsync} searchParams={searchParams} />
  );
}

interface FixturePageProps {
  readonly searchParams: Promise<{
    readonly source?: string | readonly string[];
    readonly workspace?: string | readonly string[];
  }>;
}
