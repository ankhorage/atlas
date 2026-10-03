import { parseAtlasCommandArgs } from '@/cli/parseAtlasCommandArgs';
import { runAuditSourceAsync } from '@/cli/runAuditSourceAsync';

/*** Export Atlas audit data as JSON, CSV, or the future self-contained offline HTML artifact. */
export async function runExportCommand(
  request: AtlasCommandRequest
): Promise<{ readonly exitCode: number }> {
  const argv = request.argv ?? [];
  const options = parseAtlasCommandArgs(argv);
  const exportFormat = options.exportFormat ?? 'json';

  if (exportFormat === 'offline') {
    console.error(\n      'Offline HTML export is not available yet; implementation is tracked by Atlas #261.'\n    );
    return { exitCode: 1 };
  }

  const out = hasExplicitOutput(argv)
    ? options.out
    : exportFormat === 'csv'
      ? 'audit.csv'
      : 'audit.json';

  const result = await runAuditSourceAsync(
    {
      ...options,
      out,
      failOnRuleViolation: false,
    },
    exportFormat
  );

  console.log(`✓ ${out} written → ${result.artifactPath}`);
  return { exitCode: 0 };
}

/*** Detect whether the caller explicitly selected an output path. */
function hasExplicitOutput(argv: readonly string[]): boolean {
  return argv.includes('-o') || argv.includes('--out');
}

interface AtlasCommandRequest {
  readonly argv?: readonly string[];
}
