import { parsePkgvizCommandArgs } from '@/cli/parsePkgvizCommandArgs';

/*** Reserve the canonical offline export command owned by the self-contained HTML exporter issue. */
export function runExportCommand(request: PkgvizCommandRequest): { readonly exitCode: number } {
  const options = parsePkgvizCommandArgs(request.argv ?? []);
  if (!options.offline) {
    console.error('pkgviz export currently requires --offline.');
    return { exitCode: 1 };
  }
  console.error(
    'Offline HTML export is not available yet; implementation is tracked by pkgviz #261.'
  );
  return { exitCode: 1 };
}

interface PkgvizCommandRequest {
  readonly argv?: readonly string[];
}
