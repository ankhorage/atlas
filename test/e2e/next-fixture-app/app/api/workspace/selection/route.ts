import { createWorkspaceSelectionRoute } from '@/features/workspace/adapters/inbound/next/createWorkspaceSelectionRoute';

import { createFixtureWorkspaceSelectionOperationAsync } from '../../../../../fixtureWorkspace';

/*** Stream fixture selection snapshots through the production HTTP adapter contract. */
export const POST = createWorkspaceSelectionRoute(createFixtureWorkspaceSelectionOperationAsync);
