/***
 * Prepares paint-only depth steps with a bounded cumulative tint for nested compound surfaces.
 * @performance Memoize ancestry once per projection; never traverse parents in style callbacks.
 */
export function createCompoundOpacityIndex(
  parents: ReadonlyMap<string, string>,
  detached: ReadonlySet<string>
): ReadonlyMap<string, number> {
  const depths = new Map<string, number>();
  const visiting = new Set<string>();

  /*** Resolves effective visual depth, accounting for detached dependency endpoints. */
  function depth(id: string): number {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const parent = detached.has(id) ? undefined : parents.get(id);
    const result = parent === undefined ? 0 : depth(parent) + 1;
    visiting.delete(id);
    depths.set(id, result);
    return result;
  }

  return new Map(
    [...new Set([...parents.keys(), ...parents.values()])].map(id => {
      const level = depth(id);
      const target = cumulativeTint(level);
      const previous = level === 0 ? 0 : cumulativeTint(level - 1);
      return [id, (target - previous) / (1 - previous)];
    })
  );
}

/*** Approaches an 18% cumulative tint without letting deep nesting become an opaque blue slab. */
function cumulativeTint(depth: number): number {
  return 0.04 + (0.14 * depth) / (depth + 3);
}
