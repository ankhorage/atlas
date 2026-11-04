import { createWorkspaceRetryRoute } from '@/features/workspace/adapters/inbound/next/createWorkspaceRetryRoute';
import { retryWorkspaceRepositoryAsync } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

/*** Bind the production retry route to the process-local workspace runtime. */
export const POST = createWorkspaceRetryRoute(retryWorkspaceRepositoryAsync);
