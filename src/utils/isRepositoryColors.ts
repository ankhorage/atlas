import { isRecord } from '@ankhorage/utility/object';

import { isRepositoryId } from '@/utils/isRepositoryId';

const MAXIMUM_REPOSITORY_COLORS = 100;

/*** Return whether a value is a bounded map of canonical repository RGB color overrides. */
export function isRepositoryColors(value: unknown): value is Readonly<Record<string, string>> {
  return (
    isRecord(value) &&
    Object.keys(value).length <= MAXIMUM_REPOSITORY_COLORS &&
    Object.entries(value).every(
      ([repositoryId, color]) =>
        isRepositoryId(repositoryId) && typeof color === 'string' && /^#[0-9A-F]{6}$/u.test(color)
    )
  );
}
