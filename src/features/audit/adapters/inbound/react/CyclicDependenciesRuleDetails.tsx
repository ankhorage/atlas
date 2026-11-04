'use client';
import { Badge } from '@zora/badge';
import { ListItem } from '@zora/list';
import { Switch } from '@zora/switch';
import { Text } from '@zora/text';
import { View } from '@zora/view';
import { useZoraTheme } from '@zora/ZoraProvider';
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
    <View gap="none">
      {props.group.label === null ? null : (
        <Text emphasis="muted" variant="caption">
          {props.group.label} ({props.group.entries.length})
        </Text>
      )}
      {props.group.entries.map(({ cycle, index }) => {
        const cycleId = getCycleId(cycle);
        return (
          <CycleRow
            cycle={cycle}
            index={index}
            inspected={props.inspectedCycleId === cycleId}
            key={cycleId}
            selected={props.cycleSelection.selectedIds.includes(cycleId)}
            onInspect={() =>
              props.onCycleInspectionChange(
                props.inspectedCycleId === cycleId
                  ? null
                  : createCycleInspection(
                      cycle,
                      index,
                      t('audit.cycle') + ' ' + (index + 1),
                      props.cycleColors
                    )
              )
            }
            onSelectedChange={selected => {
              props.cycleSelection.setSelected(cycleId, selected);
              if (!selected && props.inspectedCycleId === cycleId) {
                props.onCycleInspectionChange(null);
              }
            }}
          />
        );
      })}
    </View>
  );
}

/*** Renders one compact single-line cycle row with the selection switch in the trailing slot. */
function CycleRow(props: CycleRowProps) {
  const route = getCycleDisplayPath(props.cycle).join(' → ');
  const label = `C${props.index + 1}: ${route}`;

  return (
    <ListItem
      compact
      selected={props.inspected}
      testID={`cycle-row-${props.index}`}
      title={label}
      trailing={
        <Switch
          accessibilityLabel={t('audit.cycle') + ' ' + (props.index + 1)}
          checked={props.selected}
          color="danger"
          size="s"
          testID={`cycle-switch-${props.index}`}
          onCheckedChange={props.onSelectedChange}
        />
      }
      onPress={props.onInspect}
    />
  );
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

interface CycleRowProps {
  readonly inspected: boolean;
  readonly cycle: PackageCycleDetail;
  readonly index: number;
  readonly onInspect: () => void;
  readonly onSelectedChange: (selected: boolean) => void;
  readonly selected: boolean;
}
