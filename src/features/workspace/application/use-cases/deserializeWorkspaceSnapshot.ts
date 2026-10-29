import { deserializeSourceGraph } from '@ankhorage/dependency-graph';
import { isRecord } from '@ankhorage/utility/object';

import { validateWorkspaceSnapshot } from '@/features/workspace/application/use-cases/validateWorkspaceSnapshot';
import type { WorkspaceSnapshot } from '@/types/workspace';

/*** Parses and validates a portable Atlas workspace snapshot before it reaches workspace rendering. */
export function deserializeWorkspaceSnapshot(serialized: string): WorkspaceSnapshot {
  const value = parseSnapshotJson(serialized);
  if (!isRecord(value)) throw new Error('Invalid Atlas workspace snapshot schema.');
  if (value.version !== 1) {
    throw new Error(`Unsupported Atlas workspace snapshot version: ${String(value.version)}.`);
  }
  if (!validateWorkspaceSnapshot(value))
    throw new Error('Invalid Atlas workspace snapshot schema.');
  try {
    deserializeSourceGraph(value.audit.sourceGraph);
  } catch {
    throw new Error('Invalid Atlas workspace snapshot SourceGraph.');
  }
  return value;
}

/*** Parses JSON without allowing host-boundary syntax errors to escape as runtime failures. */
function parseSnapshotJson(serialized: string): unknown {
  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    throw new Error('Invalid Atlas workspace snapshot JSON.');
  }
}
