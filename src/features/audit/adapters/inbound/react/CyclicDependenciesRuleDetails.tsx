'use client';
import { Badge } from '@ankhorage/zora/web/badge';
import { List, type ListItemProps } from '@ankhorage/zora/web/list';
import { useZoraTheme } from '@ankhorage/zora/web/runtime';
import { Switch } from '@ankhorage/zora/web/switch';
import { Text } from '@ankhorage/zora/web/text';
import { View } from '@ankhorage/zora/web/view';
import React from 'react';

import { createCycleThemeColors } from '@/features/audit/utils/createCycleThemeColors';
import {
  createCycleInspection,
  getCycleDisplayPath,
  getCycleId,
} from '@/features/audit/utils/cycleVisualization';
import { t } from '@/i18n/i18n';
import type { PackageCycleDetail } from '@/types/audit';
import type { CycleInspection, CycleSelection } from '@/types/auditVisualization';

/*** Renders cycle findings with compact ZORA rows and persistent independent selection. */
export function CyclicDependenciesRuleDetails(props: CyclicDependenciesRuleDetailsProps) {
  const { theme } = useZoraTheme();
  const cycleColors = createCycleThemeColors(theme);

  return (
    <View gap="s" p="m">
      <CycleRuleHeader count={props.cycles.length} />
      <CycleRows {...props} cycleColors={cycleColors} />
    </View>
  );
}

/*** Renders the compact heading for the cyclic-dependencies rule. */
function CycleRuleHeader({ count }: { readonly count: number }) {
  return (
    <View align="center" direction="row" gap="s">
      <Text variant="label" weight="bold">
        {t('audit.rule.cyclicDependencies')}
      </Text>
      <Badge color="danger" size="s">
        {count}
      </Badge>
      <Text emphasis="muted" variant="caption">
        {t('audit.cycles')}
      </Text>
    </View>
  );
}

/*** Maps cycle findings to compact list rows while preserving inspection and selection state. */
function CycleRows({
  cycles,
  cycleColors,
  cycleSelection,
  inspectedCycleId,
  onCycleInspectionChange,
}: CycleRowsProps) {
  const groups = groupCycles(cycles);
  return (
    <View gap="none">
      {groups.map(group => (
        <CycleGroup
          cycleColors={cycleColors}
          cycleSelection={cycleSelection}
          group={group}
          inspectedCycleId={inspectedCycleId}
          key={group.id}
          onCycleInspectionChange={onCycleInspectionChange}
        />
      ))}
    </View>
  );
}

/*** Group each cycle once by its canonical repository metadata or cross-project membership. */
function groupCycles(cycles: readonly PackageCycleDetail[]): readonly CycleGroup[] {
  const groups = new Map<string, CycleGroup>();
  for (const [index, cycle] of cycles.entries()) {
    const projects = cycle.projects ?? [];
    const group =
      projects.length > 1
        ? { id: 'cross-project', label: t('audit.crossProjectCycles') }
        : projects.length === 1
          ? { id: `project:${projects[0].id}`, label: projects[0].label }
          : { id: 'single-project', label: null };
    const existing = groups.get(group.id) ?? { ...group, entries: [] };
    groups.set(group.id, { ...existing, entries: [...existing.entries, { cycle, index }] });
  }
  return [...groups.values()];
}

/*** Render a non-empty ownership group while retaining the audit-wide deterministic cycle index. */
function CycleGroup(props: CycleGroupProps) {
  return (
    <>
      {props.group.label === null ? null : (
        <Text emphasis="muted" variant="caption">
          {props.group.label} ({props.group.entries.length})
        </Text>
      )}
      <List compact items={props.group.entries.map(entry => createCycleRow(entry, props))} />
    </>
  );
}

/*** Builds one compact ZORA list item while preserving cycle inspection and selection behavior. */
function createCycleRow(
  { cycle, index }: { readonly cycle: PackageCycleDetail; readonly index: number },
  props: CycleGroupProps
): ListItemProps {
  const cycleId = getCycleId(cycle);
  return {
    selected: props.inspectedCycleId === cycleId,
    testID: `cycle-row-${index}`,
    title: `C${index + 1}: ${getCycleDisplayPath(cycle).join(' → ')}`,
    trailing: (
      <Switch
        accessibilityLabel={t('audit.cycle') + ' ' + (index + 1)}
        checked={props.cycleSelection.selectedIds.includes(cycleId)}
        color="danger"
        size="s"
        testID={`cycle-switch-${index}`}
        onCheckedChange={selected => {
          props.cycleSelection.setSelected(cycleId, selected);
          if (!selected && props.inspectedCycleId === cycleId) props.onCycleInspectionChange(null);
        }}
      />
    ),
    onPress: () =>
      props.onCycleInspectionChange(
        props.inspectedCycleId === cycleId
          ? null
          : createCycleInspection(
              cycle,
              index,
              t('audit.cycle') + ' ' + (index + 1),
              props.cycleColors
            )
      ),
  };
}

interface CyclicDependenciesRuleDetailsProps {
  readonly inspectedCycleId?: string | null;
  readonly cycles: readonly PackageCycleDetail[];
  readonly cycleSelection: CycleSelection;
  readonly onCycleInspectionChange: (inspection: CycleInspection | null) => void;
}

interface CycleRowsProps extends CyclicDependenciesRuleDetailsProps {
  readonly cycleColors: readonly string[];
}

interface CycleGroup {
  readonly id: string;
  readonly label: string | null;
  readonly entries: readonly { readonly cycle: PackageCycleDetail; readonly index: number }[];
}

interface CycleGroupProps {
  readonly cycleColors: readonly string[];
  readonly cycleSelection: CycleSelection;
  readonly group: CycleGroup;
  readonly inspectedCycleId: string | null | undefined;
  readonly onCycleInspectionChange: (inspection: CycleInspection | null) => void;
}
