import type { AuditRuleConfiguration } from '@/types/audit';

export interface PkgvizCliOptions {
  readonly out: string;
  readonly open: boolean;
  readonly serve: boolean;
  readonly prod: boolean;
  readonly waitMs: number;
  readonly pretty: boolean;
  readonly verbose: boolean;
  readonly failOnRuleViolation: boolean;
  readonly help: boolean;
  readonly excludePaths: readonly string[];
  readonly rules: readonly AuditRuleConfiguration[];
  readonly port?: number;
}
