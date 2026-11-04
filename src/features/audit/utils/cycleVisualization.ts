import type { PackageCycleDetail } from '@/types/audit';
import type { CycleFocus, CycleHighlight, CycleInspection } from '@/types/auditVisualization';

/*** Returns one stable cycle color from the active ZORA-derived cycle palette. */
export function getCycleColor(colors: readonly string[], index: number): string {
  if (colors.length === 0) return 'currentColor';
  return colors[index % colors.length];
}

/*** Returns the stable UI identity for one cycle occurrence. */
export function getCycleId(cycle: PackageCycleDetail): string {
  return JSON.stringify([
    [...new Set(cycle.packages)].sort(),
    cycle.edges
      .map(edge => [edge.from, edge.to])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  ]);
}

/*** Read display labels without ever replacing the canonical identities used by the graph. */
export function getCycleDisplayPath(cycle: PackageCycleDetail): readonly string[] {
  return cycle.displayPackages ?? cycle.packages;
}

/*** Creates one stable cycle highlight descriptor. */
function createCycleHighlight(
  cycle: PackageCycleDetail,
  index: number,
  colors: readonly string[]
): CycleHighlight {
  return {
    id: getCycleId(cycle),
    color: getCycleColor(colors, index),
    cycle,
  };
}

/*** Creates graph highlights for the selected cycle occurrence IDs. */
export function createCycleHighlights(
  cycles: readonly PackageCycleDetail[],
  selectedCycleIds: readonly string[],
  colors: readonly string[]
): readonly CycleHighlight[] {
  return cycles.flatMap((cycle, index) => {
    const id = getCycleId(cycle);
    return selectedCycleIds.includes(id) ? [createCycleHighlight(cycle, index, colors)] : [];
  });
}

/*** Creates the narrowest scope and least depth that expose every active cycle package. */
export function createCycleFocus(highlights: readonly CycleHighlight[]): CycleFocus | null {
  const packageNames = [...new Set(highlights.flatMap(highlight => highlight.cycle.packages))];
  if (packageNames.length === 0) return null;

  const packageSegments = packageNames.map(packageName => packageName.split('.'));
  const [firstSegments, ...remainingSegments] = packageSegments;
  const mismatchIndex = firstSegments.findIndex((segment, index) =>
    remainingSegments.some(segments => segments.at(index) !== segment)
  );
  const commonDepth = mismatchIndex === -1 ? firstSegments.length : mismatchIndex;
  const commonSegments = firstSegments.slice(0, commonDepth);
  const commonPackage = commonSegments.join('.');
  const focusSegments = packageNames.includes(commonPackage)
    ? commonSegments.slice(0, -1)
    : commonSegments;

  return {
    currentPackage: focusSegments.join('.'),
    packageDepth: Math.max(
      1,
      ...packageSegments.map(segments => segments.length - focusSegments.length)
    ),
  };
}

/*** Creates the inspector descriptor for one cycle row. */
export function createCycleInspection(
  cycle: PackageCycleDetail,
  index: number,
  label: string,
  colors: readonly string[]
): CycleInspection {
  return {
    ...createCycleHighlight(cycle, index, colors),
    label,
  };
}
