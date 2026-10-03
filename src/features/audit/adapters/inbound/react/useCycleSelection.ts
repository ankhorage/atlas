'use client';
import { isRecord } from '@ankhorage/utility/object';
import { useZoraTheme } from '@zora/ZoraProvider';
import { useLocalStorage } from 'ankh-hooks/store';
import { useCallback, useMemo } from 'react';

import { resolveSelectedCycleIds } from '@/features/audit/application/use-cases/resolveSelectedCycleIds';
import { createCycleThemeColors } from '@/features/audit/utils/createCycleThemeColors';
import { createCycleHighlights } from '@/features/audit/utils/cycleVisualization';
import { readSettingsEnvironment } from '@/features/settings/utils/readSettingsEnvironment';
import type { PackageCycleDetail } from '@/types/audit';
import type { CycleSelection } from '@/types/auditVisualization';

/*** Owns persisted cycle choices independently of sidebar mounting and navigation. */
export function useCycleSelection(cycles: readonly PackageCycleDetail[]): CycleSelection {
  const { theme } = useZoraTheme();
  const project = process.env.NEXT_PUBLIC_PROJECT_PATH ?? 'default';
  const [stored, setStored] = useLocalStorage<string>('atlas:cycles:v1:' + project, '{}');
  const choices = useMemo(() => readChoices(stored), [stored]);
  const enabledByDefault = readSettingsEnvironment().showCycles;
  const selectedIds = useMemo(
    () => resolveSelectedCycleIds(cycles, choices, enabledByDefault),
    [cycles, choices, enabledByDefault]
  );
  const cycleColors = useMemo(() => createCycleThemeColors(theme), [theme]);
  const highlights = useMemo(
    () => createCycleHighlights(cycles, selectedIds, cycleColors),
    [cycleColors, cycles, selectedIds]
  );
  const setSelected = useCallback(
    (id: string, selected: boolean) => {
      setStored(previous => JSON.stringify({ ...readChoices(previous), [id]: selected }));
    },
    [setStored]
  );

  return useMemo(
    () => ({ highlights, selectedIds, setSelected }),
    [highlights, selectedIds, setSelected]
  );
}

/*** Parses the versioned persistence payload at the browser boundary. */
function readChoices(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
