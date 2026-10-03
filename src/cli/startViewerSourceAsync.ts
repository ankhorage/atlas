import { startViewerAsync } from '@/cli/startViewerAsync';
import { parseProjectSource } from '@/features/project-source/application/use-cases/parseProjectSource';
import { loadProjectSourceAsync } from '@/features/project-source/composition/loadProjectSourceAsync';
import type { AtlasCliOptions } from '@/types/cli';

/*** Resolve one local or GitHub source and keep it alive for the viewer lifecycle. */
export async function startViewerSourceAsync(options: AtlasCliOptions): Promise<void> {
  const source = parseProjectSource(options.source ?? process.cwd());
  const resolved = await loadProjectSourceAsync(source);

  try {
    await startViewerAsync(resolved.rootPath, options, resolved.cleanupAsync);
  } catch (error) {
    await resolved.cleanupAsync();
    throw error;
  }
}
