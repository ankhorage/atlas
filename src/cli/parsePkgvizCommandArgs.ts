import { parsePkgvizCliArgs } from '@/cli/parsePkgvizCliArgs';
import type { PkgvizCliOptions } from '@/types/cli';

/*** Parse an Ankh command argv using the same option contract as the legacy PKGViz binary. */
export function parsePkgvizCommandArgs(argv: readonly string[]): PkgvizCliOptions {
  return parsePkgvizCliArgs(['ankh', 'pkgviz', ...argv]);
}
