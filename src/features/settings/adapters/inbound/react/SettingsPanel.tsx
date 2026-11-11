'use client';
import { Select } from '@zora/select';
import { Switch } from '@zora/switch';
import { Text } from '@zora/text';
import { TextInput } from '@zora/text-input';
import { View } from '@zora/view';
import { useZoraTheme } from '@zora/ZoraProvider';
import type { LayoutOptions } from 'cytoscape';
import React, { type ChangeEvent } from 'react';

import { useSettings } from '@/features/settings/adapters/inbound/react/useSettings';
import { t } from '@/i18n/i18n';

const LAYOUT_OPTIONS: readonly LayoutOptions['name'][] = [
  'breadthfirst',
  'circle',
  'concentric',
  'elk',
  'grid',
];

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

/*** Renders package-visibility settings through ZORA switches. */
function FilterSettings() {
  const {
    showCompoundNodes,
    showVendorPackages,
    dependencyPackagePrefix,
    setDependencyPackagePrefix,
    toggleShowCompoundNodes,
    toggleShowVendorPackages,
  } = useSettings();

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
        options={LAYOUT_OPTIONS.map(value => ({ label: t(value), value }))}
        onValueChange={selectLayout}
        testID="cytoscape-layout"
      />
    </SettingsSection>
  );
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
