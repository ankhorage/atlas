import { formatAuditRuleFailures } from '@/cli/formatAuditRuleFailures';
import { getAtlasHelp } from '@/cli/getAtlasHelp';
import { parseAtlasCommandArgs } from '@/cli/parseAtlasCommandArgs';
import { runAuditSourceAsync } from '@/cli/runAuditSourceAsync';

/*** Execute `ankh atlas audit` through the canonical project-source and audit boundaries. */
export async function audit(request: AtlasCommandRequest): Promise<{ readonly exitCode: number }> {
  const options = parseAtlasCommandArgs(request.argv ?? []);
  if (options.help) {
    console.log(getAtlasHelp());
    return { exitCode: 0 };
  }

  const result = await runAuditSourceAsync(options);
  console.log(`✓ audit.json written → ${result.artifactPath}`);
  if (result.exitCode !== 0) {
    console.error(formatAuditRuleFailures(result.audit.evaluation.rules, result.artifactPath));
  }
  return { exitCode: result.exitCode };
}

interface AtlasCommandRequest {
  readonly argv?: readonly string[];
}
