import { toErrorMessage } from '@ankhorage/utility/error';

import { formatAuditRuleFailures } from '@/cli/formatAuditRuleFailures';
import { getPkgvizHelp } from '@/cli/getPkgvizHelp';
import { parsePkgvizCliArgs } from '@/cli/parsePkgvizCliArgs';
import { runAuditSourceAsync } from '@/cli/runAuditSourceAsync';
import { startViewerSourceAsync } from '@/cli/startViewerSourceAsync';

/*** Runs the legacy PKGViz binary through the same source and command boundaries as Ankh. */
export async function runPkgvizCliAsync(argv: readonly string[] = process.argv): Promise<void> {
  try {
    const options = parsePkgvizCliArgs(argv);
    if (options.help) {
      console.log(getPkgvizHelp());
      return;
    }

    if (options.offline) {
      throw new Error(
        'Offline HTML export is not available yet; implementation is tracked by #261.'
      );
    }

    if (options.open || options.serve) {
      await startViewerSourceAsync(options);
      return;
    }

    const result = await runAuditSourceAsync(options);
    console.log(`✓ audit.json written → ${result.artifactPath}`);
    if (result.exitCode === 0) return;
    console.error(formatAuditRuleFailures(result.audit.evaluation.rules, result.artifactPath));
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error('✖ pkgviz failed:', toErrorMessage(error, 'Unknown PKGViz CLI failure.'));
    process.exitCode = 1;
  }
}
