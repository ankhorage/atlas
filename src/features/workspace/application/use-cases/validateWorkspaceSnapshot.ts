import { isRecord } from '@ankhorage/utility/object';

import { validateAuditSnapshot } from '@/features/workspace/application/use-cases/validateAuditSnapshot';
import type { WorkspaceSnapshot } from '@/types/workspace';

/*** Validates the Atlas-owned workspace envelope and delegates its audit payload by responsibility. */
export function validateWorkspaceSnapshot(value: unknown): value is WorkspaceSnapshot {
  return isRecord(value) && value.version === 1 && validateAuditSnapshot(value.audit);
}
