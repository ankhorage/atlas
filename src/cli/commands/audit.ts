import { formatAuditRuleFailures } from '@/cli/formatAuditRuleFailures';
import { getPkgvizHelp } from '@/cli/getPkgvizHelp';
import { parsePkgvizCommandArgs } from '@/cli/parsePkgvizCommandArgs';
import { runAuditSourceAsync } from '@/cli/runAuditSourceAsync';

/*** Execute `ankh pkgviz audit` through the canonical project-source and audit boundaries. */
export async function audit(request: PkgvizCommandRequest): Promise<{ readonly exitCode: number }> {
  const options = parsePkgvizCommandArgs(request.argv ?? []);
  if (options.help) {
    console.log(getPkgvizHelp());
    return { exitCode: 0 };
  }

  const result = await runAuditSourceAsync(options);
  console.log(`✓ audit.json written → ${result.artifactPath}`);
  if (result.exitCode !== 0) {
    console.error(formatAuditRuleFailures(result.audit.evaluation.rules, result.artifactPath));
  }
  return { exitCode: result.exitCode };
}

interface PkgvizCommandRequest {
  readonly argv?: readonly string[];
}
