import { parseAtlasCliArgs } from '@/cli/parseAtlasCliArgs';
import type { AtlasCliOptions } from '@/types/cli';

/*** Parse an Ankh Atlas command argv using the standalone CLI option contract. */
export function parseAtlasCommandArgs(argv: readonly string[]): AtlasCliOptions {
  return parseAtlasCliArgs(['ankh', 'atlas', ...argv]);
}
