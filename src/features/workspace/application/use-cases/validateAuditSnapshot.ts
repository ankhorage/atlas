import { externalSnapshotContracts } from '@/features/workspace/application/use-cases/externalSnapshotContracts';
import { workspaceSnapshotValidation as validation } from '@/features/workspace/application/use-cases/workspaceSnapshotValidation';
import { Language } from '@/types/language';

/*** Validates Atlas-owned audit state and delegates imported domain contracts at their boundary. */
export function validateAuditSnapshot(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    isAuditConfiguration(value.configuration) &&
    isAuditEvaluation(value.evaluation) &&
    isAuditMeta(value.meta) &&
    isProjectFileTree(value.files) &&
    externalSnapshotContracts.isDependencyGraph(value.packageGraph) &&
    typeof value.sourceGraph === 'string'
  );
}

/*** Validates persisted Atlas audit configuration. */
function isAuditConfiguration(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    typeof value.failOnRuleViolation === 'boolean' &&
    validation.isOptional(value.architectureTarget, isArchitectureTarget) &&
    validation.isArrayOf(value.rules, isAuditRuleConfiguration)
  );
}

/*** Validates the Atlas target wrapper around an external architecture target. */
function isArchitectureTarget(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    (value.kind === 'model' || value.kind === 'profile') &&
    typeof value.id === 'string'
  );
}

/*** Validates all collections displayed by the workspace audit panels. */
function isAuditEvaluation(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    externalSnapshotContracts.isArchitectureDetection(value.architecture) &&
    validation.isOptional(
      value.architectureEvaluation,
      externalSnapshotContracts.isArchitectureEvaluation
    ) &&
    validation.isArrayOf(value.cyclicPackages, isPackageCycle) &&
    externalSnapshotContracts.isRuleEvaluation(value.genericRules) &&
    validation.isArrayOf(value.rules, isAuditRuleResult)
  );
}

/*** Validates one configured Atlas audit-rule mode. */
function isAuditRuleConfiguration(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    typeof value.id === 'string' &&
    validation.isOneOf(value.mode, AUDIT_RULE_MODES)
  );
}

/*** Validates one Atlas-specific audit-rule result. */
function isAuditRuleResult(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    typeof value.id === 'string' &&
    validation.isOneOf(value.status, AUDIT_RULE_STATUSES) &&
    validation.isOneOf(value.policy, AUDIT_RULE_POLICIES) &&
    typeof value.message === 'string' &&
    validation.isArrayOf(value.details, validation.isString) &&
    validation.isJsonValue(value.evidence)
  );
}

/*** Validates persisted audit metadata. */
function isAuditMeta(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    typeof value.projectName === 'string' &&
    validation.isFiniteNumber(value.timeStart) &&
    validation.isFiniteNumber(value.timeEnd) &&
    isParserSelection(value.language) &&
    validation.isOptional(value.source, isAuditSource)
  );
}

/*** Validates optional GitHub source provenance. */
function isAuditSource(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    value.kind === 'github' &&
    typeof value.revision === 'string' &&
    typeof value.url === 'string'
  );
}

/*** Validates one complete cycle and its edge evidence. */
function isPackageCycle(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    validation.isArrayOf(value.packages, validation.isString) &&
    validation.isArrayOf(value.edges, isCycleEdge)
  );
}

/*** Validates one directed cycle edge. */
function isCycleEdge(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    typeof value.from === 'string' &&
    typeof value.to === 'string' &&
    validation.isArrayOf(value.via, isImportEvidence)
  );
}

/*** Validates import evidence rendered by cycle details. */
function isImportEvidence(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    typeof value.filePath === 'string' &&
    typeof value.fileClass === 'string' &&
    typeof value.importName === 'string' &&
    validation.isOptional(value.isIntrinsic, validation.isBoolean)
  );
}

/*** Validates the recursive project tree and its file leaves. */
function isProjectFileTree(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    Object.values(value).every(item => isProjectFileTree(item) || isProjectFileMetadata(item))
  );
}

/*** Validates one project-file metadata leaf including import metadata. */
function isProjectFileMetadata(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    typeof value.className === 'string' &&
    validation.isArrayOf(value.imports, isProjectImportMetadata) &&
    typeof value.package === 'string' &&
    typeof value.path === 'string'
  );
}

/*** Validates one file import retained for tree projection. */
function isProjectImportMetadata(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.pkg === 'string' &&
    validation.isOptional(value.isIntrinsic, validation.isBoolean)
  );
}

/*** Validates the Atlas parser choice while accepting future Project Detector candidates. */
function isParserSelection(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    validation.isOneOf(value.language, Object.values(Language)) &&
    validation.isFiniteNumber(value.score) &&
    validation.isArrayOf(value.indicators, validation.isString) &&
    validation.isArrayOf(value.candidates, externalSnapshotContracts.isDetectedLanguage)
  );
}

const AUDIT_RULE_MODES = ['audit', 'block', 'off'];
const AUDIT_RULE_POLICIES = ['advisory', 'blocking'];
const AUDIT_RULE_STATUSES = ['failed', 'passed'];
