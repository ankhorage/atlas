import { getAtlasHelp } from '@/cli/getAtlasHelp';
import { parseAtlasCommandArgs } from '@/cli/parseAtlasCommandArgs';
import { startViewerSourceAsync } from '@/cli/startViewerSourceAsync';

/*** Execute `ankh atlas inspect` through the canonical project-source and viewer boundaries. */
export async function inspect(
  request: AtlasCommandRequest
): Promise<{ readonly exitCode: number }> {
  const options = parseAtlasCommandArgs(request.argv ?? []);
  if (options.help) {
    console.log(getAtlasHelp());
    return { exitCode: 0 };
  }
  await startViewerSourceAsync({ ...options, open: true, serve: true });
  return { exitCode: 0 };
}

interface AtlasCommandRequest {
  readonly argv?: readonly string[];
}
