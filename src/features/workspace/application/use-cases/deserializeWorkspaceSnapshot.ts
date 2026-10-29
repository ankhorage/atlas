import { deserializeSourceGraph } from '@ankhorage/dependency-graph';
import { isRecord } from '@ankhorage/utility/object';

import type { WorkspaceSnapshot } from '@/types/workspace';

/* eslint-disable max-lines */

type UnknownRecord = Readonly<Record<string, unknown>>;

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

/*** Parses JSON without allowing host-boundary syntax errors to escape as runtime failures. */
function parseSnapshotJson(serialized: string): unknown {
  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    throw new Error('Invalid Atlas workspace snapshot JSON.');
  }
}

/*** Verifies every Atlas-owned value that workspace hydration and rendering can consume. */
function isWorkspaceSnapshot(value: unknown): value is WorkspaceSnapshot {
  return isRecord(value) && value.version === 1 && isAudit(value.audit);
}

/*** Verifies the complete Audit envelope while delegating SourceGraph semantics to its owner. */
function isAudit(value: unknown): value is UnknownRecord & { readonly sourceGraph: string } {
  return (
    isRecord(value) &&
    isAuditConfiguration(value.configuration) &&
    isAuditEvaluation(value.evaluation) &&
    isAuditMeta(value.meta) &&
    isProjectFileTree(value.files) &&
    isPackageGraph(value.packageGraph) &&
    typeof value.sourceGraph === 'string'
  );
}

/*** Validates persisted Atlas audit configuration. */
function isAuditConfiguration(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.failOnRuleViolation === 'boolean' &&
    isOptional(value.architectureTarget, isArchitectureTarget) &&
    isArrayOf(value.rules, isAuditRuleConfiguration)
  );
}

/*** Validates one configured rule mode. */
function isAuditRuleConfiguration(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string' && isOneOf(value.mode, AUDIT_RULE_MODES);
}

/*** Validates all collections displayed by the workspace audit panels. */
function isAuditEvaluation(value: unknown): boolean {
  return (
    isRecord(value) &&
    isArchitectureDetection(value.architecture) &&
    isOptional(value.architectureEvaluation, isArchitectureEvaluation) &&
    isArrayOf(value.cyclicPackages, isPackageCycle) &&
    isRuleEvaluation(value.genericRules) &&
    isArrayOf(value.rules, isAuditRuleResult)
  );
}

/*** Validates architecture candidates shown in the analysis panel. */
function isArchitectureDetection(value: unknown): boolean {
  return isRecord(value) && isArrayOf(value.candidates, isArchitectureCandidate);
}

/*** Validates one rendered architecture candidate. */
function isArchitectureCandidate(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.confidence) &&
    isArrayOf(value.contradictions, isArchitectureContradiction) &&
    isArchitectureModelId(value.modelId) &&
    isArrayOf(value.roleAssignments, isArchitectureRoleAssignment) &&
    isFiniteNumber(value.score) &&
    isArrayOf(value.supportingEvidence, isArchitectureEvidence) &&
    isArrayOf(value.unavailableCapabilities, isString)
  );
}

/*** Validates one inferred role and its evidence. */
function isArchitectureRoleAssignment(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.confidence) &&
    isArrayOf(value.evidence, isArchitectureEvidence) &&
    typeof value.roleId === 'string' &&
    typeof value.semanticPath === 'string'
  );
}

/*** Validates one architecture-analysis evidence item. */
function isArchitectureEvidence(value: unknown): boolean {
  return (
    isRecord(value) &&
    isOneOf(value.kind, ARCHITECTURE_EVIDENCE_KINDS) &&
    typeof value.message === 'string' &&
    isOptional(value.semanticPath, isString) &&
    isFiniteNumber(value.weight)
  );
}

/*** Validates one architecture contradiction displayed to users. */
function isArchitectureContradiction(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.message === 'string' &&
    typeof value.relationKind === 'string' &&
    typeof value.sourceRole === 'string' &&
    typeof value.sourceSemanticPath === 'string' &&
    typeof value.targetRole === 'string' &&
    typeof value.targetSemanticPath === 'string'
  );
}

/*** Validates an optional explicit architecture evaluation. */
function isArchitectureEvaluation(value: unknown): boolean {
  if (!isRecord(value) || !isArchitectureTarget(value.target) || !isRecord(value.result))
    return false;
  if (!isRuleEvaluation(value.result)) return false;
  return value.target.kind === 'model'
    ? isArchitectureModelId(value.result.modelId) &&
        isArrayOf(value.result.roleAssignments, isArchitectureRoleAssignment)
    : isArchitectureModelId(value.result.baseModelId) && value.result.profileId === 'ankhorage';
}

/*** Validates one model or profile target. */
function isArchitectureTarget(
  value: unknown
): value is UnknownRecord & { readonly kind: 'model' | 'profile' } {
  return (
    isRecord(value) &&
    ((value.kind === 'model' && isArchitectureModelId(value.id)) ||
      (value.kind === 'profile' && value.id === 'ankhorage'))
  );
}

/*** Narrows published architecture-model identifiers. */
function isArchitectureModelId(value: unknown): boolean {
  return isOneOf(value, ARCHITECTURE_MODELS);
}

/*** Validates one complete cycle and its edge evidence. */
function isPackageCycle(value: unknown): boolean {
  return (
    isRecord(value) && isArrayOf(value.packages, isString) && isArrayOf(value.edges, isCycleEdge)
  );
}

/*** Validates one directed cycle edge. */
function isCycleEdge(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.from === 'string' &&
    typeof value.to === 'string' &&
    isArrayOf(value.via, isImportEvidence)
  );
}

/*** Validates import evidence rendered by cycle details. */
function isImportEvidence(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.filePath === 'string' &&
    typeof value.fileClass === 'string' &&
    typeof value.importName === 'string' &&
    isOptional(value.isIntrinsic, isBoolean)
  );
}

/*** Validates generic Rules results rendered by the workspace. */
function isRuleEvaluation(value: unknown): boolean {
  return (
    isRecord(value) &&
    isArrayOf(value.diagnostics, isRuleDiagnostic) &&
    isArrayOf(value.findings, isRuleFinding)
  );
}

/*** Validates one generic Rules diagnostic. */
function isRuleDiagnostic(value: unknown): boolean {
  return (
    isRecord(value) &&
    isOneOf(value.code, RULE_DIAGNOSTIC_CODES) &&
    typeof value.message === 'string' &&
    typeof value.ruleId === 'string'
  );
}

/*** Validates one generic Rules finding and all values rendered from it. */
function isRuleFinding(value: unknown): boolean {
  return (
    isRecord(value) &&
    isJsonValue(value.evidence) &&
    typeof value.message === 'string' &&
    typeof value.ruleId === 'string' &&
    isOneOf(value.severity, RULE_SEVERITIES) &&
    isOptional(value.sourceLocation, isRuleSourceLocation) &&
    isArrayOf(value.subjects, isRuleSubject)
  );
}

/*** Validates one finding subject. */
function isRuleSubject(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.kind === 'string' &&
    isOptional(value.path, isString)
  );
}

/*** Validates optional source coordinates attached to a finding. */
function isRuleSourceLocation(value: unknown): boolean {
  return (
    isRecord(value) &&
    isOptional(value.column, isFiniteNumber) &&
    isOptional(value.endColumn, isFiniteNumber) &&
    isOptional(value.endLine, isFiniteNumber) &&
    isFiniteNumber(value.line) &&
    typeof value.path === 'string'
  );
}

/*** Validates one Atlas-specific rule result. */
function isAuditRuleResult(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isOneOf(value.status, AUDIT_RULE_STATUSES) &&
    isOneOf(value.policy, AUDIT_RULE_POLICIES) &&
    typeof value.message === 'string' &&
    isArrayOf(value.details, isString) &&
    isJsonValue(value.evidence)
  );
}

/*** Validates persisted audit metadata. */
function isAuditMeta(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.projectName === 'string' &&
    isFiniteNumber(value.timeStart) &&
    isFiniteNumber(value.timeEnd) &&
    isParserSelection(value.language) &&
    isOptional(value.source, isAuditSource)
  );
}

/*** Validates optional GitHub source provenance. */
function isAuditSource(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.kind === 'github' &&
    typeof value.revision === 'string' &&
    typeof value.url === 'string'
  );
}

/*** Validates the selected parser and detector candidates. */
function isParserSelection(value: unknown): boolean {
  return (
    isRecord(value) &&
    isOneOf(value.language, PARSER_LANGUAGES) &&
    isFiniteNumber(value.score) &&
    isArrayOf(value.indicators, isString) &&
    isArrayOf(value.candidates, isDetectedLanguage)
  );
}

/*** Validates one detector language candidate retained by Atlas. */
function isDetectedLanguage(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isFiniteNumber(value.score) &&
    isArrayOf(value.evidence, isString) &&
    isArrayOf(value.sourceRoots, isString)
  );
}

/*** Validates graph topology and all graph data consumed by Cytoscape and navigation. */
function isPackageGraph(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isArrayOf(value.nodes, isPackageGraphNode) ||
    !isArrayOf(value.edges, isPackageGraphEdge)
  )
    return false;
  const nodeIds = new Set(value.nodes.map(node => (isRecord(node) ? node.id : undefined)));
  return (
    nodeIds.size === value.nodes.length &&
    value.edges.every(
      edge => isRecord(edge) && nodeIds.has(edge.source) && nodeIds.has(edge.target)
    )
  );
}

/*** Validates one package graph node. */
function isPackageGraphNode(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isRecord(value.data) &&
    isOneOf(value.data.classification, NODE_CLASSIFICATIONS) &&
    typeof value.data.path === 'string' &&
    typeof value.data.parent === 'string' &&
    typeof value.data.label === 'string' &&
    typeof value.data.name === 'string' &&
    isOptional(value.data.isIntrinsic, isBoolean)
  );
}

/*** Validates one package graph edge. */
function isPackageGraphEdge(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.source === 'string' &&
    typeof value.target === 'string' &&
    isRecord(value.data) &&
    isFiniteNumber(value.data.weight) &&
    isArrayOf(value.data.evidence, isDependencyImportEvidence)
  );
}

/*** Validates dependency import evidence retained on graph edges. */
function isDependencyImportEvidence(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.sourceFile === 'string' &&
    typeof value.specifier === 'string' &&
    isOneOf(value.classification, IMPORT_CLASSIFICATIONS) &&
    isArrayOf(value.declarations, isDependencyDeclaration)
  );
}

/*** Validates one dependency declaration. */
function isDependencyDeclaration(value: unknown): boolean {
  return (
    isRecord(value) && isOneOf(value.kind, DECLARATION_KINDS) && typeof value.range === 'string'
  );
}

/*** Validates the recursive project tree and its file leaves. */
function isProjectFileTree(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.values(value).every(item => isProjectFileTree(item) || isProjectFileMetadata(item))
  );
}

/*** Validates one project-file metadata leaf including import metadata. */
function isProjectFileMetadata(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.className === 'string' &&
    isArrayOf(value.imports, isProjectImportMetadata) &&
    typeof value.package === 'string' &&
    typeof value.path === 'string'
  );
}

/*** Validates one file import retained for tree projection. */
function isProjectImportMetadata(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.pkg === 'string' &&
    isOptional(value.isIntrinsic, isBoolean)
  );
}

/*** Checks recursively serializable evidence without accepting non-finite JSON numbers. */
function isJsonValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    isFiniteNumber(value)
  )
    return true;
  return Array.isArray(value)
    ? value.every(isJsonValue)
    : isRecord(value) && Object.values(value).every(isJsonValue);
}

/*** Applies a predicate only when an optional value is present. */
function isOptional(value: unknown, predicate: (candidate: unknown) => boolean): boolean {
  return value === undefined || predicate(value);
}

/*** Validates every member of an untrusted list. */
function isArrayOf(
  value: unknown,
  predicate: (candidate: unknown) => boolean
): value is readonly unknown[] {
  return Array.isArray(value) && value.every(predicate);
}

/*** Narrows finite numbers accepted at the JSON boundary. */
function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

/*** Narrows string values for nested records. */
function isString(value: unknown): boolean {
  return typeof value === 'string';
}

/*** Narrows Boolean values for optional flags. */
function isBoolean(value: unknown): boolean {
  return typeof value === 'boolean';
}

/*** Narrows one string literal from a fixed portable vocabulary. */
function isOneOf(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === 'string' && allowed.includes(value);
}

const AUDIT_RULE_MODES = ['audit', 'block', 'off'];
const AUDIT_RULE_POLICIES = ['advisory', 'blocking'];
const AUDIT_RULE_STATUSES = ['failed', 'passed'];
const ARCHITECTURE_EVIDENCE_KINDS = ['capability', 'declaration', 'dependency', 'path', 'topology'];
const ARCHITECTURE_MODELS = ['hexagonal', 'clean', 'onion', 'layered'];
const DECLARATION_KINDS = ['dependency', 'devDependency', 'optionalDependency', 'peerDependency'];
const IMPORT_CLASSIFICATIONS = ['intrinsic', 'unknown', 'vendor', 'focus'];
const NODE_CLASSIFICATIONS = ['intrinsic', 'unknown', 'vendor'];
const PARSER_LANGUAGES = [
  'cpp',
  'delphi',
  'javascript',
  'kotlin',
  'python',
  'typescript',
  'java',
  'unknown',
];
const RULE_DIAGNOSTIC_CODES = [
  'invalid-config',
  'invalid-options',
  'missing-capability',
  'unknown-rule',
];
const RULE_SEVERITIES = ['error', 'info', 'warning'];
