import { getPkgvizHelp } from '@/cli/getPkgvizHelp';
import { parsePkgvizCommandArgs } from '@/cli/parsePkgvizCommandArgs';
import { startViewerSourceAsync } from '@/cli/startViewerSourceAsync';

/*** Execute `ankh pkgviz view` through the canonical project-source and viewer boundaries. */
export async function view(request: PkgvizCommandRequest): Promise<{ readonly exitCode: number }> {
  const options = parsePkgvizCommandArgs(request.argv ?? []);
  if (options.help) {
    console.log(getPkgvizHelp());
    return { exitCode: 0 };
  }
  await startViewerSourceAsync({ ...options, open: true });
  return { exitCode: 0 };
}

interface PkgvizCommandRequest {
  readonly argv?: readonly string[];
}
