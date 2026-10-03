import type { SourceGraph } from '@ankhorage/dependency-graph';
import type { RuleEvaluationResult } from '@ankhorage/rules';
import type {
  ArchitectureDetectionResult,
  ArchitectureEvaluationResult,
  ArchitectureModel,
  ArchitectureProfile,
  ArchitectureProfileEvaluationResult,
} from '@ankhorage/rules-architecture';

import type { PackageDependencyGraph } from '@/types/dependencyAnalysis';
import type { ParserSelection } from '@/types/parserSelection';
import type { ProjectFileTree } from '@/types/projectFiles';

type AuditRuleMode = 'audit' | 'block' | 'off';
type AuditRulePolicy = 'advisory' | 'blocking';
type AuditRuleStatus = 'failed' | 'passed';

export type AuditArchitectureTarget =
  | { readonly kind: 'model'; readonly id: ArchitectureModel['id'] }
  | { readonly kind: 'profile'; readonly id: ArchitectureProfile['id'] };

export type AuditArchitectureEvaluation =
  | {
      readonly target: Extract<AuditArchitectureTarget, { readonly kind: 'model' }>;
      readonly result: ArchitectureEvaluationResult;
    }
  | {
      readonly target: Extract<AuditArchitectureTarget, { readonly kind: 'profile' }>;
      readonly result: ArchitectureProfileEvaluationResult;
    };

export interface AuditRuleConfiguration {
  readonly id: string;
  readonly mode: AuditRuleMode;
}

export interface AuditConfiguration {
  readonly architectureTarget?: AuditArchitectureTarget;
  readonly failOnRuleViolation: boolean;
  readonly rules: readonly AuditRuleConfiguration[];
}

export interface ResolveAuditConfigurationInput {
  readonly architectureTarget?: AuditArchitectureTarget;
  readonly failOnRuleViolation?: boolean;
  readonly rules?: readonly AuditRuleConfiguration[];
}

export interface ImportEvidence {
  readonly filePath: string;
  readonly fileClass: string;
  readonly importName: string;
  readonly isIntrinsic?: boolean;
}

export interface CycleEdgeEvidence {
  readonly from: string;
  readonly to: string;
  readonly via: readonly ImportEvidence[];
}

export interface PackageCycleDetail {
  readonly packages: readonly string[];
  readonly edges: readonly CycleEdgeEvidence[];
}

export interface AuditRuleResult<TEvidence = unknown> {
  readonly id: string;
  readonly status: AuditRuleStatus;
  readonly policy: AuditRulePolicy;
  readonly message: string;
  readonly details: readonly string[];
  readonly evidence: TEvidence;
}

export interface CyclicDependenciesEvidence {
  readonly cycles: readonly PackageCycleDetail[];
}

interface AuditEvaluation {
  readonly architecture: ArchitectureDetectionResult;
  readonly architectureEvaluation?: AuditArchitectureEvaluation;
  readonly cyclicPackages: readonly PackageCycleDetail[];
  readonly genericRules: RuleEvaluationResult;
  readonly rules: readonly AuditRuleResult[];
}

export interface AuditSourceMetadata {
  readonly kind: 'github';
  readonly revision: string;
  readonly url: string;
}

export interface AuditMetaInput {
  readonly projectName?: string;
  readonly source?: AuditSourceMetadata;
}

interface AuditMeta {
  readonly timeEnd: number;
  readonly timeStart: number;
  readonly language: ParserSelection;
  readonly projectName: string;
  readonly source?: AuditSourceMetadata;
}

export interface Audit {
  readonly configuration: AuditConfiguration;
  readonly evaluation: AuditEvaluation;
  readonly meta: AuditMeta;
  readonly files: ProjectFileTree;
  readonly packageGraph: PackageDependencyGraph;
  readonly sourceGraph: string;
}

export interface EvaluateAuditRulesInput {
  readonly configuration: AuditConfiguration;
  readonly cyclicPackages: readonly PackageCycleDetail[];
  readonly sourceGraph: SourceGraph;
}

export interface EvaluateAuditRulesResult {
  readonly genericRules: RuleEvaluationResult;
  readonly rules: readonly AuditRuleResult[];
}
