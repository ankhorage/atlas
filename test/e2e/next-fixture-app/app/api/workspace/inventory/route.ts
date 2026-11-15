import { createWorkspaceInventoryRoute } from '@/features/workspace/adapters/inbound/next/createWorkspaceInventoryRoute';

import { discoverFixtureWorkspaceInventoryAsync } from '../../../../../fixtureWorkspace';

/*** Return fixture inventory through the production owner-discovery transport contract. */
export const GET = createWorkspaceInventoryRoute(source =>
  discoverFixtureWorkspaceInventoryAsync(source)
);
