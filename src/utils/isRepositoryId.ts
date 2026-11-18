/*** Return whether a repository identity is safe to persist outside a filesystem path. */
export function isRepositoryId(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\\/\s]/u.test(value)
  );
}
