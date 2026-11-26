'use client';
import { useZoraTheme } from '@ankhorage/zora/web/runtime';
import { Select } from '@ankhorage/zora/web/select';
import { Switch } from '@ankhorage/zora/web/switch';
import { Text } from '@ankhorage/zora/web/text';
import { TextInput } from '@ankhorage/zora/web/text-input';
import { View } from '@ankhorage/zora/web/view';
import type { LayoutOptions } from 'cytoscape';
import React, { type ChangeEvent } from 'react';

import { useSettings } from '@/features/settings/adapters/inbound/react/useSettings';
import { t } from '@/i18n/i18n';

const LAYOUT_OPTIONS = [
  'breadthfirst',
  'circle',
  'concentric',
  'elk',
  'grid',
] as const satisfies readonly LayoutOptions['name'][];

const LAYOUT_MEDIA = {
  breadthfirst: {
    uri: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 28 28%22%3E%3Cpath d=%22M6 6v16m0-8h7m0 0v-5m0 5v5m0-5h7%22 fill=%22none%22 stroke=%22%236b7280%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22 stroke-width=%222.5%22/%3E%3Ccircle cx=%226%22 cy=%226%22 r=%222%22 fill=%22%236b7280%22/%3E%3Ccircle cx=%2213%22 cy=%229%22 r=%222%22 fill=%22%236b7280%22/%3E%3Ccircle cx=%2213%22 cy=%2219%22 r=%222%22 fill=%22%236b7280%22/%3E%3Ccircle cx=%2220%22 cy=%2214%22 r=%222%22 fill=%22%236b7280%22/%3E%3C/svg%3E',
  },
  circle: {
    uri: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 28 28%22%3E%3Ccircle cx=%2214%22 cy=%2214%22 r=%228%22 fill=%22none%22 stroke=%22%236b7280%22 stroke-width=%222.5%22/%3E%3Ccircle cx=%2214%22 cy=%226%22 r=%222%22 fill=%22%236b7280%22/%3E%3Ccircle cx=%2221%22 cy=%2218%22 r=%222%22 fill=%22%236b7280%22/%3E%3Ccircle cx=%227%22 cy=%2218%22 r=%222%22 fill=%22%236b7280%22/%3E%3C/svg%3E',
  },
  concentric: {
    uri: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 28 28%22%3E%3Ccircle cx=%2214%22 cy=%2214%22 r=%223%22 fill=%22%236b7280%22/%3E%3Ccircle cx=%2214%22 cy=%2214%22 r=%227%22 fill=%22none%22 stroke=%22%236b7280%22 stroke-width=%222.5%22/%3E%3Ccircle cx=%2214%22 cy=%2214%22 r=%2211%22 fill=%22none%22 stroke=%22%236b7280%22 stroke-width=%222.5%22/%3E%3C/svg%3E',
  },
  elk: {
    uri: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 28 28%22%3E%3Cpath d=%22M6 7h7m0 0v14m0-7h9%22 fill=%22none%22 stroke=%22%236b7280%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22 stroke-width=%222.5%22/%3E%3Ccircle cx=%226%22 cy=%227%22 r=%222%22 fill=%22%236b7280%22/%3E%3Ccircle cx=%2213%22 cy=%227%22 r=%222%22 fill=%22%236b7280%22/%3E%3Ccircle cx=%2213%22 cy=%2221%22 r=%222%22 fill=%22%236b7280%22/%3E%3Ccircle cx=%2222%22 cy=%2214%22 r=%222%22 fill=%22%236b7280%22/%3E%3C/svg%3E',
  },
  grid: {
    uri: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 28 28%22%3E%3Cpath d=%22M7 7h4v4H7zm10 0h4v4h-4zM7 17h4v4H7zm10 0h4v4h-4z%22 fill=%22%236b7280%22/%3E%3C/svg%3E',
  },
} as const;

/*** Renders persistent graph controls from generated ZORA form and layout elements. */
export function SettingsPanel() {
  return (
    <View gap="l" p="m">
      <FilterSettings />
      <SubPackageDepthSettings />
      <LayoutSettings />
      <LayoutSpacingSettings />
    </View>
  );
}

/*** Keeps prepared package-visibility controls ready for their planned return to the sidebar. */
function FilterSettings({ visible = false }: FilterSettingsProps) {
  const {
    showCompoundNodes,
    showVendorPackages,
    dependencyPackagePrefix,
    setDependencyPackagePrefix,
    toggleShowCompoundNodes,
    toggleShowVendorPackages,
  } = useSettings();

  if (!visible) return null;
  return (
    <SettingsSection title={t('settings.filter')}>
      <TextInput
        aria-label={t('settings.packagePrefix')}
        placeholder={t('settings.packagePrefix')}
        value={dependencyPackagePrefix}
        onChangeText={setDependencyPackagePrefix}
      />
      <Switch
        accessibilityLabel={t('settings.showVendorPackages')}
        checked={showVendorPackages}
        onCheckedChange={(checked: boolean) => {
          if (checked !== showVendorPackages) toggleShowVendorPackages();
        }}
        testID="switch-show-vendor-packages"
      >
        {t('settings.showVendorPackages')}
      </Switch>
      <Switch
        accessibilityLabel={t('settings.showCompoundNodes')}
        checked={showCompoundNodes}
        onCheckedChange={(checked: boolean) => {
          if (checked !== showCompoundNodes) toggleShowCompoundNodes();
        }}
        testID="switch-show-compound-nodes"
      >
        {t('settings.showCompoundNodes')}
      </Switch>
    </SettingsSection>
  );
}

interface FilterSettingsProps {
  readonly visible?: boolean;
}

/*** Renders the visible subpackage-depth control. */
function SubPackageDepthSettings() {
  const { maxSubPackageDepth, setSubPackageDepth, subPackageDepth } = useSettings();

  return (
    <SettingsSection title={t('settings.subPackageDepth') + ': ' + subPackageDepth}>
      <SettingsSlider
        ariaLabel={t('settings.subPackageDepth')}
        max={maxSubPackageDepth}
        min={1}
        step={1}
        value={subPackageDepth}
        onValueChange={setSubPackageDepth}
      />
    </SettingsSection>
  );
}

/*** Renders the active graph layout selector through ZORA Select. */
function LayoutSettings() {
  const { cytoscapeLayout, setCytoscapeLayout } = useSettings();

  /*** Lets the Select close immediately before starting a potentially expensive graph layout. */
  const selectLayout = (layout: LayoutOptions['name']) => {
    React.startTransition(() => setCytoscapeLayout(layout));
  };

  return (
    <SettingsSection title={t('settings.layout')}>
      <Select
        value={cytoscapeLayout}
        options={LAYOUT_OPTIONS.map(value => ({
          label: t(value),
          leadingMedia: layoutMedia(value),
          value,
        }))}
        onValueChange={selectLayout}
        testID="cytoscape-layout"
      />
    </SettingsSection>
  );
}

/*** Resolves the SVG media owned by each supported layout algorithm. */
function layoutMedia(layout: (typeof LAYOUT_OPTIONS)[number]) {
  switch (layout) {
    case 'breadthfirst':
      return LAYOUT_MEDIA.breadthfirst;
    case 'circle':
      return LAYOUT_MEDIA.circle;
    case 'concentric':
      return LAYOUT_MEDIA.concentric;
    case 'elk':
      return LAYOUT_MEDIA.elk;
    case 'grid':
      return LAYOUT_MEDIA.grid;
  }
}

/*** Renders the active layout-spacing control. */
function LayoutSpacingSettings() {
  const { cytoscapeLayoutSpacing, setCytoscapeLayoutSpacing } = useSettings();

  return (
    <SettingsSection title={t('settings.layoutSpacing') + ': ' + cytoscapeLayoutSpacing.toFixed(2)}>
      <SettingsSlider
        ariaLabel={t('settings.layoutSpacing')}
        max={1}
        min={0.1}
        step={0.01}
        value={cytoscapeLayoutSpacing}
        onValueChange={setCytoscapeLayoutSpacing}
      />
    </SettingsSection>
  );
}

/*** Composes one settings group from ZORA layout and typography primitives. */
function SettingsSection({ children, title }: SettingsSectionProps) {
  return (
    <View gap="s">
      <Text variant="label" weight="bold">
        {title}
      </Text>
      {children}
    </View>
  );
}

/*** Renders the native numeric range using the active ZORA brand token. */
function SettingsSlider({ ariaLabel, max, min, onValueChange, step, value }: SettingsSliderProps) {
  const { theme } = useZoraTheme();

  /*** Applies one browser range value through the settings owner. */
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onValueChange(Number.parseFloat(event.target.value));
  };

  return (
    <input
      aria-label={ariaLabel}
      max={max}
      min={min}
      step={step}
      type="range"
      value={value}
      onChange={handleChange}
      style={{
        accentColor: theme.semantics.brand.base,
        cursor: 'pointer',
        width: '100%',
      }}
    />
  );
}

interface SettingsSectionProps {
  readonly children: React.ReactNode;
  readonly title: React.ReactNode;
}

interface SettingsSliderProps {
  readonly ariaLabel: string;
  readonly max: number;
  readonly min: number;
  readonly onValueChange: (value: number) => void;
  readonly step: number;
  readonly value: number;
}
