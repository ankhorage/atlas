import { listArchitectureModels } from '@ankhorage/rules-architecture';

import { workspaceSnapshotValidation as validation } from '@/features/workspace/application/use-cases/workspaceSnapshotValidation';

/*** Validates the external contract subsets Atlas consumes without copying their closed vocabularies. */
export const externalSnapshotContracts = {
  isArchitectureDetection,
  isArchitectureEvaluation,
  isDependencyGraph,
  isDetectedLanguage,
  isRuleEvaluation,
};

/*** Validates architecture data supplied by the published Rules Architecture contract. */
function isArchitectureDetection(value: unknown): boolean {
  return (
    validation.isRecord(value) && validation.isArrayOf(value.candidates, isArchitectureCandidate)
  );
}

/*** Validates an explicit architecture evaluation supplied by Rules Architecture. */
function isArchitectureEvaluation(value: unknown): boolean {
  if (
    !validation.isRecord(value) ||
    !validation.isRecord(value.target) ||
    !validation.isRecord(value.result) ||
    !isArchitectureTarget(value.target) ||
    !isRuleEvaluation(value.result)
  )
    return false;
  return value.target.kind === 'model'
    ? isPublishedArchitectureModelId(value.result.modelId) &&
        validation.isArrayOf(value.result.roleAssignments, isArchitectureRoleAssignment)
    : isPublishedArchitectureModelId(value.result.baseModelId) &&
        typeof value.result.profileId === 'string';
}

/*** Validates external package graph data without freezing owner-controlled classifications. */
function isDependencyGraph(value: unknown): boolean {
  if (
    !validation.isRecord(value) ||
    !validation.isArrayOf(value.nodes, isPackageGraphNode) ||
    !validation.isArrayOf(value.edges, isPackageGraphEdge)
  )
    return false;
  const nodeIds = new Set(
    value.nodes.map(node => (validation.isRecord(node) ? node.id : undefined))
  );
  return (
    nodeIds.size === value.nodes.length &&
    value.edges.every(
      edge => validation.isRecord(edge) && nodeIds.has(edge.source) && nodeIds.has(edge.target)
    )
  );
}

/*** Validates Project Detector language evidence while leaving its identifiers owner-extensible. */
function isDetectedLanguage(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    typeof value.id === 'string' &&
    validation.isFiniteNumber(value.score) &&
    validation.isArrayOf(value.evidence, validation.isString) &&
    validation.isArrayOf(value.sourceRoots, validation.isString)
  );
}

/*** Validates one architecture candidate rendered by Atlas. */
function isArchitectureCandidate(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    validation.isFiniteNumber(value.confidence) &&
    validation.isArrayOf(value.contradictions, isArchitectureContradiction) &&
    isPublishedArchitectureModelId(value.modelId) &&
    validation.isArrayOf(value.roleAssignments, isArchitectureRoleAssignment) &&
    validation.isFiniteNumber(value.score) &&
    validation.isArrayOf(value.supportingEvidence, isArchitectureEvidence) &&
    validation.isArrayOf(value.unavailableCapabilities, validation.isString)
  );
}

/*** Validates one architecture contradiction displayed to users. */
function isArchitectureContradiction(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    typeof value.message === 'string' &&
    typeof value.relationKind === 'string' &&
    typeof value.sourceRole === 'string' &&
    typeof value.sourceSemanticPath === 'string' &&
    typeof value.targetRole === 'string' &&
    typeof value.targetSemanticPath === 'string'
  );
}

/*** Validates evidence without closing its owner-controlled kind. */
function isArchitectureEvidence(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    typeof value.kind === 'string' &&
    typeof value.message === 'string' &&
    validation.isOptional(value.semanticPath, validation.isString) &&
    validation.isFiniteNumber(value.weight)
  );
}

/*** Validates one inferred role and its external evidence. */
function isArchitectureRoleAssignment(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    validation.isFiniteNumber(value.confidence) &&
    validation.isArrayOf(value.evidence, isArchitectureEvidence) &&
    typeof value.roleId === 'string' &&
    typeof value.semanticPath === 'string'
  );
}

/*** Validates a model or profile target without duplicating the profile owner's vocabulary. */
function isArchitectureTarget(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    ((value.kind === 'model' && isPublishedArchitectureModelId(value.id)) ||
      (value.kind === 'profile' && typeof value.id === 'string'))
  );
}

/*** Reads model identifiers from the published owner API instead of a local copy. */
function isPublishedArchitectureModelId(value: unknown): boolean {
  return typeof value === 'string' && listArchitectureModels().some(model => model.id === value);
}

/*** Validates one dependency declaration while leaving its owner-controlled kind extensible. */
function isDependencyDeclaration(value: unknown): boolean {
  return (
    validation.isRecord(value) && typeof value.kind === 'string' && typeof value.range === 'string'
  );
}

/*** Validates dependency import evidence while leaving external classifications extensible. */
function isDependencyImportEvidence(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    typeof value.sourceFile === 'string' &&
    typeof value.specifier === 'string' &&
    typeof value.classification === 'string' &&
    validation.isArrayOf(value.declarations, isDependencyDeclaration)
  );
}

/*** Validates one package graph edge. */
function isPackageGraphEdge(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.source === 'string' &&
    typeof value.target === 'string' &&
    validation.isRecord(value.data) &&
    validation.isFiniteNumber(value.data.weight) &&
    validation.isArrayOf(value.data.evidence, isDependencyImportEvidence)
  );
}

/*** Validates one package graph node. */
function isPackageGraphNode(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    typeof value.id === 'string' &&
    validation.isRecord(value.data) &&
    typeof value.data.classification === 'string' &&
    typeof value.data.path === 'string' &&
    typeof value.data.parent === 'string' &&
    typeof value.data.label === 'string' &&
    typeof value.data.name === 'string' &&
    validation.isOptional(value.data.isIntrinsic, validation.isBoolean)
  );
}

/*** Validates one generic Rules diagnostic without closing its owner-controlled code. */
function isRuleDiagnostic(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    typeof value.ruleId === 'string'
  );
}

/*** Validates one generic Rules finding without closing its owner-controlled severity. */
function isRuleFinding(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    validation.isJsonValue(value.evidence) &&
    typeof value.message === 'string' &&
    typeof value.ruleId === 'string' &&
    typeof value.severity === 'string' &&
    validation.isOptional(value.sourceLocation, isRuleSourceLocation) &&
    validation.isArrayOf(value.subjects, isRuleSubject)
  );
}

/*** Validates generic Rules results rendered by the workspace. */
function isRuleEvaluation(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    validation.isArrayOf(value.diagnostics, isRuleDiagnostic) &&
    validation.isArrayOf(value.findings, isRuleFinding)
  );
}

/*** Validates optional source coordinates attached to a Rules finding. */
function isRuleSourceLocation(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    validation.isOptional(value.column, validation.isFiniteNumber) &&
    validation.isOptional(value.endColumn, validation.isFiniteNumber) &&
    validation.isOptional(value.endLine, validation.isFiniteNumber) &&
    validation.isFiniteNumber(value.line) &&
    typeof value.path === 'string'
  );
}

/*** Validates one Rules finding subject. */
function isRuleSubject(value: unknown): boolean {
  return (
    validation.isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.kind === 'string' &&
    validation.isOptional(value.path, validation.isString)
  );
}
