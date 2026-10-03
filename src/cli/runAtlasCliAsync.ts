import { toErrorMessage } from '@ankhorage/utility/error';

import { formatAuditRuleFailures } from '@/cli/formatAuditRuleFailures';
import { getAtlasHelp } from '@/cli/getAtlasHelp';
import { parseAtlasCliArgs } from '@/cli/parseAtlasCliArgs';
import { runAuditSourceAsync } from '@/cli/runAuditSourceAsync';
import { startViewerSourceAsync } from '@/cli/startViewerSourceAsync';

/*** Runs the Atlas binary through the same source and command boundaries as Ankh. */
export async function runAtlasCliAsync(argv: readonly string[] = process.argv): Promise<void> {
  try {
    const options = parseAtlasCliArgs(argv);
    if (options.help) {
      console.log(getAtlasHelp());
      return;
    }

    if (options.exportFormat === 'offline') {
      throw new Error(\n        'Offline HTML export is not available yet; implementation is tracked by #261.'\n      );
    }

    if (options.open || options.serve) {
      await startViewerSourceAsync(options);
      return;
    }

    if (options.exportFormat !== undefined) {
      const artifactFormat = options.exportFormat === 'csv' ? 'csv' : 'json';
      const out =
        options.out === 'audit.json' && artifactFormat === 'csv' ? 'audit.csv' : options.out;
      const result = await runAuditSourceAsync(
        { ...options, out, failOnRuleViolation: false },
        artifactFormat
      );
      console.log(`✓ ${out} written → ${result.artifactPath}`);
      return;
    }

    const result = await runAuditSourceAsync(options);
    console.log(`✓ audit.json written → ${result.artifactPath}`);
    if (result.exitCode === 0) return;
    console.error(formatAuditRuleFailures(result.audit.evaluation.rules, result.artifactPath));
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error('✖ atlas failed:', toErrorMessage(error, 'Unknown Atlas CLI failure.'));
    process.exitCode = 1;
  }
}
