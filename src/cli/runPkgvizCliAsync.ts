import { toErrorMessage } from '@ankhorage/utility/error';

import { formatAuditRuleFailures } from '@/cli/formatAuditRuleFailures';
import { getPkgvizHelp } from '@/cli/getPkgvizHelp';
import { parsePkgvizCliArgs } from '@/cli/parsePkgvizCliArgs';
import { runAuditAsync } from '@/cli/runAuditAsync';
import { startViewerAsync } from '@/cli/startViewerAsync';
import type { PkgvizCliOptions } from '@/types/cli';

/*** Runs the PKGViz CLI from parsed input through audit or viewer boundaries. */
export async function runPkgvizCliAsync(argv: readonly string[] = process.argv): Promise<void> {
  try {
    const options = parsePkgvizCliArgs(argv);
    if (options.help) {
      console.log(getPkgvizHelp());
      return;
    }

    const callerRoot = process.cwd();
    if (!options.open && !options.serve) {
      await runAuditCommandAsync(callerRoot, options);
      return;
    }

    await startViewerAsync(callerRoot, options);
  } catch (error) {
    console.error('✖ pkgviz failed:', toErrorMessage(error, 'Unknown PKGViz CLI failure.'));
    process.exitCode = 1;
  }
}

/*** Runs the default audit command and maps blocking findings onto the process exit contract. */
async function runAuditCommandAsync(callerRoot: string, options: PkgvizCliOptions): Promise<void> {
  if (options.verbose) console.log('[pkgviz]', `Running audit for ${callerRoot}`);

  const result = await runAuditAsync({
    projectPath: callerRoot,
    outputPath: options.out,
    pretty: options.pretty,
    configuration: {
      ...(options.architectureTarget === undefined
        ? {}
        : { architectureTarget: options.architectureTarget }),
      failOnRuleViolation: options.failOnRuleViolation,
      rules: options.rules,
    },
  });

  console.log(`✓ audit.json written → ${result.artifactPath}`);
  if (result.exitCode === 0) return;
  console.error(formatAuditRuleFailures(result.audit.evaluation.rules, result.artifactPath));
  process.exitCode = result.exitCode;
}
