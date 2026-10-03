'use client';
import type { SelectionIntent } from '@ankhorage/utility/selection';
import { Badge } from '@zora/badge';
import { ScrollView } from '@zora/scroll-view';
import { Surface } from '@zora/surface';
import { Tab, TabList, TabPanel, Tabs } from '@zora/tabs';
import { View } from '@zora/view';
import { useZoraTheme } from '@zora/ZoraProvider';
import React from 'react';

import { AuditExportPanel } from '@/features/audit/adapters/inbound/react/AuditExportPanel';
import { AuditRulePanel } from '@/features/audit/adapters/inbound/react/AuditRulePanel';
import { ProjectTreePanel } from '@/features/project-tree/adapters/inbound/react/ProjectTreePanel';
import { SettingsPanel } from '@/features/settings/adapters/inbound/react/SettingsPanel';
import { t } from '@/i18n/i18n';
import type { Audit } from '@/types/audit';
import type { CycleInspection, CycleSelection } from '@/types/auditVisualization';
import type { ProjectTreeNode } from '@/types/projectTree';

/*** Compose workspace tools and persistent graph settings from generated ZORA elements. */
export function WorkspaceSidebar(props: WorkspaceSidebarProps) {
  const { theme } = useZoraTheme();
  const [activeTool, setActiveTool] = React.useState('tree');

  /*** Close cycle evidence when leaving the Rules tool and update the active tab. */
  const selectTool = (value: string) => {
    if (activeTool === 'rules' && value !== 'rules') props.onCycleInspectionChange(null);
    setActiveTool(value);
  };

  return (
    <aside
      style={{
        alignSelf: 'stretch',
        borderRight: `1px solid ${theme.semantics.border.subtle}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        maxWidth: 288,
        minHeight: 0,
        minWidth: 288,
        overflow: 'hidden',
        width: 288,
      }}
    >
      <Surface style={{ height: '100%', overflow: 'hidden' }}>
        <View flex={1} style={{ minHeight: 0, overflow: 'hidden' }}>
          <WorkspaceToolTabs {...props} activeTool={activeTool} onValueChange={selectTool} />
        </View>
        <SettingsPanel />
      </Surface>
    </aside>
  );
}

/*** Render the workspace tool selector and delegate panel content. */
function WorkspaceToolTabs(props: WorkspaceToolTabsProps) {
  const findingCount = countRuleFindings(props.evaluation);
  const hasRuleContent = hasRulesContent(props.evaluation);

  return (
    <Tabs
      flex={1}
      minHeight={0}
      overflow="hidden"
      value={props.activeTool}
      onValueChange={props.onValueChange}
    >
      <TabList>
        <Tab label={t('settings.tree')} value="tree" />
        {hasRuleContent ? (
          <Tab
            label={t('settings.rules')}
            trailing={
              findingCount > 0 ? (
                <Badge color="danger" size="s">
                  {findingCount}
                </Badge>
              ) : undefined
            }
            value="rules"
          />
        ) : null}
        <Tab label={t('settings.export')} value="export" />
      </TabList>
      <WorkspaceTabPanels {...props} hasRuleContent={hasRuleContent} />
    </Tabs>
  );
}

/*** Render Tree, Rules, and Export panel bodies inside the workspace tabs. */
function WorkspaceTabPanels(props: WorkspaceTabPanelsProps) {
  return (
    <>
      <TabPanel flex={1} minHeight={0} value="tree">
        <ScrollView flex={1} minHeight={0} testID="sidebar-tree-scroll">
          <ProjectTreePanel
            nodes={props.projectTree}
            selectedIds={props.selectedTreeIds}
            onSelect={props.onProjectTreeSelect}
          />
        </ScrollView>
      </TabPanel>
      {props.hasRuleContent ? <WorkspaceRulesPanel {...props} /> : null}
      <TabPanel flex={1} minHeight={0} value="export">
        <ScrollView flex={1} minHeight={0} testID="sidebar-export-scroll">
          <AuditExportPanel source={props.currentSource} />
        </ScrollView>
      </TabPanel>
    </>
  );
}

/*** Render audit-rule findings and cycle inspection controls for the Rules tab. */
function WorkspaceRulesPanel(props: WorkspaceSidebarProps) {
  return (
    <TabPanel flex={1} minHeight={0} value="rules">
      <ScrollView flex={1} minHeight={0} testID="sidebar-rules-scroll">
        {props.evaluation === null ? null : (
          <AuditRulePanel
            evaluation={props.evaluation}
            cycleSelection={props.cycleSelection}
            inspectedCycleId={props.inspectedCycleId}
            onCycleInspectionChange={props.onCycleInspectionChange}
          />
        )}
      </ScrollView>
    </TabPanel>
  );
}

/*** Report whether the Rules tool has actual rule findings to inspect. */
function hasRulesContent(evaluation: Audit['evaluation'] | null): boolean {
  return evaluation !== null && countRuleFindings(evaluation) > 0;
}

/*** Count canonical and specialized findings represented by the workspace Rules tool. */
function countRuleFindings(evaluation: Audit['evaluation'] | null): number {
  if (evaluation === null) return 0;
  const specialized = evaluation.rules
    .filter(rule => rule.status === 'failed')
    .reduce(
      (count, rule) =>
        count +
        (rule.id === 'cyclic-dependencies'
          ? evaluation.cyclicPackages.length
          : rule.details.length),
      0
    );
  const generic = evaluation.genericRules.findings.filter(
    ({ ruleId }) => ruleId !== 'cyclic-dependencies'
  ).length;
  return specialized + generic;
}

interface WorkspaceSidebarProps {
  readonly currentSource?: string;
  readonly inspectedCycleId: string | null;
  readonly evaluation: Audit['evaluation'] | null;
  readonly projectTree: readonly ProjectTreeNode[];
  readonly selectedTreeIds: readonly string[];
  readonly onProjectTreeSelect: (node: ProjectTreeNode, intent: SelectionIntent) => void;
  readonly cycleSelection: CycleSelection;
  readonly onCycleInspectionChange: (inspection: CycleInspection | null) => void;
}

interface WorkspaceToolTabsProps extends WorkspaceSidebarProps {
  readonly activeTool: string;
  readonly onValueChange: (value: string) => void;
}

interface WorkspaceTabPanelsProps extends WorkspaceToolTabsProps {
  readonly hasRuleContent: boolean;
}
