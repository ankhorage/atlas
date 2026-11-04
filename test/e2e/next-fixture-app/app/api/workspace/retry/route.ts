import { createWorkspaceRetryRoute } from '@/features/workspace/adapters/inbound/next/createWorkspaceRetryRoute';

import { retryFixtureWorkspaceRepositoryAsync } from '../../../../../fixtureWorkspace';

/*** Exposes the test-owned fixture runtime through the production Retry transport contract. */
export const POST = createWorkspaceRetryRoute(retryFixtureWorkspaceRepositoryAsync);
