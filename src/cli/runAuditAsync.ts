import { resolveFileSystemPathWithinRoot, writeFileWithinRoot } from '@ankhorage/utility/node/fs';

import { createAuditAsync } from '@/features/audit/composition/createAuditAsync';
import { hasBlockingAuditRuleFailure } from '@/features/audit/domain/hasBlockingAuditRuleFailure';
import type { Audit, ResolveAuditConfigurationInput } from '@/types/audit';
import type { ProjectAnalysisOptions } from '@/types/projectAnalysis';

/*** Creates, writes, and evaluates an audit while retaining the artifact on rule failure. */
export async function runAuditAsync(input: RunAuditInput): Promise<RunAuditResult> {
  const audit = await createAuditAsync(input.projectPath, input.configuration, input.analysis);
  const body = input.pretty ? JSON.stringify(audit, null, 2) : JSON.stringify(audit);

  await writeFileWithinRoot({
    rootPath: input.projectPath,
    filePath: input.outputPath,
    body: new TextEncoder().encode(body),
    exclusive: false,
  });

  const artifactPath = resolveFileSystemPathWithinRoot(input.projectPath, input.outputPath);
  const shouldFail =
    audit.configuration.failOnRuleViolation && hasBlockingAuditRuleFailure(audit.evaluation.rules);

  return {
    audit,
    artifactPath,
    exitCode: shouldFail ? 2 : 0,
  };
}

interface RunAuditInput {
  readonly projectPath: string;
  readonly outputPath: string;
  readonly pretty: boolean;
  readonly configuration?: ResolveAuditConfigurationInput;
  readonly analysis?: ProjectAnalysisOptions;
}

interface RunAuditResult {
  readonly audit: Audit;
  readonly artifactPath: string;
  readonly exitCode: 0 | 2;
}
