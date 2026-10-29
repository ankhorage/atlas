import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'bun';

/*** Bundles the actual Atlas React and ZORA workspace for one inline browser artifact. */
export async function buildOfflineWorkspaceBundleAsync() {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const outputPath = resolve(moduleDirectory, '../../../../../../offline/atlas-workspace.js');
  await mkdir(dirname(outputPath), { recursive: true });
  const result = await build({
    define: { 'process.env': '{}' },
    entrypoints: [resolve(moduleDirectory, '../../inbound/browser/bootstrapOfflineWorkspace.tsx')],
    format: 'iife',
    minify: true,
    naming: 'atlas-workspace.[ext]',
    outdir: dirname(outputPath),
    sourcemap: 'none',
    target: 'browser',
  });
  if (!result.success) {
    throw new Error(result.logs.map(log => log.message).join('\n'));
  }
  const css = result.outputs.find(output => output.path.endsWith('.css'));
  const javascript = result.outputs.find(output => output.path.endsWith('.js'));
  if (css === undefined || javascript === undefined) {
    throw new Error('Atlas offline bundle did not produce JavaScript and CSS artifacts.');
  }
}

if (import.meta.main) await buildOfflineWorkspaceBundleAsync();
