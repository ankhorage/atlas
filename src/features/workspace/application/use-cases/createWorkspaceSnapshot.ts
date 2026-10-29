import { createAuditFromSnapshot } from '@/features/audit/application/use-cases/createAuditFromSnapshot';
import type { ProjectSnapshot } from '@/types/projectAnalysis';
import type { WorkspaceSnapshot } from '@/types/workspace';

/*** Captures the complete canonical Audit required to render one portable Atlas workspace. */
export function createWorkspaceSnapshot(snapshot: ProjectSnapshot): WorkspaceSnapshot {
  return { audit: createAuditFromSnapshot(snapshot), version: 1 };
}
