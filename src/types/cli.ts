import type { AuditArchitectureTarget, AuditRuleConfiguration } from '@/types/audit';

export interface PkgvizCliOptions {
  readonly architectureTarget?: AuditArchitectureTarget;
  readonly source?: string;
  readonly out: string;
  readonly open: boolean;
  readonly serve: boolean;
  readonly prod: boolean;
  readonly waitMs: number;
  readonly pretty: boolean;
  readonly verbose: boolean;
  readonly failOnRuleViolation: boolean;
  readonly help: boolean;
  readonly offline: boolean;
  readonly rules: readonly AuditRuleConfiguration[];
  readonly port?: number;
}
