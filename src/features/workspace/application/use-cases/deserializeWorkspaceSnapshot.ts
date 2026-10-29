import { deserializeSourceGraph } from '@ankhorage/dependency-graph';
import { isRecord } from '@ankhorage/utility/object';

import type { Audit } from '@/types/audit';
import type { ProjectFileMetadata, ProjectFileTree } from '@/types/projectFiles';
import type { WorkspaceSnapshot } from '@/types/workspace';

/*** Parses and validates a portable Atlas workspace snapshot before it reaches workspace rendering. */
export function deserializeWorkspaceSnapshot(serialized: string): WorkspaceSnapshot {
  const value = parseSnapshotJson(serialized);
  if (!isRecord(value)) throw new Error('Invalid Atlas workspace snapshot schema.');
  if (value.version !== 1) {
    throw new Error(`Unsupported Atlas workspace snapshot version: ${String(value.version)}.`);
  }
  if (!isWorkspaceSnapshot(value)) throw new Error('Invalid Atlas workspace snapshot schema.');

  try {
    deserializeSourceGraph(value.audit.sourceGraph);
  } catch {
    throw new Error('Invalid Atlas workspace snapshot SourceGraph.');
  }

  return value;
}

/*** Parses snapshot JSON while exposing malformed payloads as an explicit host-boundary error. */
function parseSnapshotJson(serialized: string): unknown {
  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    throw new Error('Invalid Atlas workspace snapshot JSON.');
  }
}

/*** Verifies the Atlas-owned envelope before any workspace data is hydrated. */
function isWorkspaceSnapshot(value: unknown): value is WorkspaceSnapshot {
  return isRecord(value) && value.version === 1 && isAudit(value.audit);
}

/*** Verifies every Audit field consumed by the portable workspace view. */
function isAudit(value: unknown): value is Audit {
  if (!isRecord(value)) return false;
  return (
    isAuditConfiguration(value.configuration) &&
    isAuditEvaluation(value.evaluation) &&
    isAuditMeta(value.meta) &&
    isProjectFileTree(value.files) &&
    isPackageGraph(value.packageGraph) &&
    typeof value.sourceGraph === 'string'
  );
}

/*** Validates audit configuration values retained in the portable payload. */
function isAuditConfiguration(value: unknown): boolean {
  return (
    isRecord(value) && typeof value.failOnRuleViolation === 'boolean' && Array.isArray(value.rules)
  );
}

/*** Validates the evaluation collections rendered by the workspace audit panels. */
function isAuditEvaluation(value: unknown): boolean {
  return (
    isRecord(value) &&
    isRecord(value.architecture) &&
    Array.isArray(value.cyclicPackages) &&
    isRecord(value.genericRules) &&
    Array.isArray(value.rules)
  );
}

/*** Validates the audit metadata shown by hosts without requiring a filesystem source. */
function isAuditMeta(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.projectName === 'string' &&
    typeof value.timeStart === 'number' &&
    typeof value.timeEnd === 'number' &&
    isRecord(value.language)
  );
}

/*** Validates the package graph envelope consumed by the existing graph adapter. */
function isPackageGraph(value: unknown): boolean {
  return (
    isRecord(value) &&
    Array.isArray(value.nodes) &&
    Array.isArray(value.edges) &&
    value.nodes.every(isGraphNode) &&
    value.edges.every(isGraphEdge)
  );
}

/*** Validates one graph node without duplicating canonical dependency-graph semantics. */
function isGraphNode(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string' && isRecord(value.data);
}

/*** Validates one graph edge without interpreting dependency evidence in the host. */
function isGraphEdge(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.source === 'string' &&
    typeof value.target === 'string' &&
    isRecord(value.data)
  );
}

/*** Validates a JSON project tree recursively before passing it to tree navigation. */
function isProjectFileTree(value: unknown): value is ProjectFileTree {
  if (!isRecord(value)) return false;
  return Object.values(value).every(item => isProjectFileTree(item) || isProjectFileMetadata(item));
}

/*** Validates one leaf metadata record while keeping parser semantics in its existing owner. */
function isProjectFileMetadata(value: unknown): value is ProjectFileMetadata {
  return (
    isRecord(value) &&
    typeof value.className === 'string' &&
    Array.isArray(value.imports) &&
    typeof value.package === 'string' &&
    typeof value.path === 'string'
  );
}
