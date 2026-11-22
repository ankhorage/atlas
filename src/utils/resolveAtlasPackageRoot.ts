import { createRequire } from 'node:module';
import { dirname } from 'node:path';

/*** Resolves Atlas's package root from its public manifest instead of a bundled module location. */
export function resolveAtlasPackageRoot(): string {
  return dirname(createRequire(import.meta.url).resolve('@ankhorage/atlas/package.json'));
}
