import { resolveFileSystemPathWithinRoot, writeFileWithinRoot } from '@ankhorage/utility/node/fs';

import { createAuditAsync } from '@/features/audit/composition/createAuditAsync';
import { hasBlockingAuditRuleFailure } from '@/features/audit/domain/hasBlockingAuditRuleFailure';
import type { Audit, AuditMetaInput, ResolveAuditConfigurationInput } from '@/types/audit';

/*** Creates, writes, and evaluates an audit while retaining the artifact on rule failure. */
export async function runAuditAsync(input: RunAuditInput): Promise<RunAuditResult> {
  const audit = await createAuditAsync(input.projectPath, input.configuration, input.meta);
  const body = input.pretty ? JSON.stringify(audit, null, 2) : JSON.stringify(audit);

  await writeFileWithinRoot({
    rootPath: input.outputRootPath ?? input.projectPath,
    filePath: input.outputPath,
    body: new TextEncoder().encode(body),
    exclusive: false,
  });

  const artifactPath = resolveFileSystemPathWithinRoot(
    input.outputRootPath ?? input.projectPath,
    input.outputPath
  );
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
  readonly outputRootPath?: string;
  readonly pretty: boolean;
  readonly configuration?: ResolveAuditConfigurationInput;
  readonly meta?: AuditMetaInput;
}

interface RunAuditResult {
  readonly audit: Audit;
  readonly artifactPath: string;
  readonly exitCode: 0 | 2;
}
