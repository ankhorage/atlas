'use client';
import { type ColorHarmony, parseHexColorOrThrow } from '@ankhorage/color-theory';
import { Popover } from '@ankhorage/surface/browser';
import type { ColorPickerTab, ColorToneDefinition } from '@ankhorage/zora';
import { Button } from '@ankhorage/zora/web/button';
import { ColorPicker } from '@ankhorage/zora/web/color-picker';
import { useState } from 'react';

import { repositoryColor } from '@/constants/repositoryColor';
import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';
import type { SettingsContextValue } from '@/types/settings';

import styles from './WorkspaceHeader.module.css';

interface RepositoryColorControlProps {
  readonly repository: WorkspaceRepositoryOption;
  readonly repositoryColorTones: readonly ColorToneDefinition[];
  readonly settings: SettingsContextValue;
}

/*** Edits one repository's persisted graph color without participating in repository selection. */
export function RepositoryColorControl({
  repository,
  repositoryColorTones,
  settings,
}: RepositoryColorControlProps) {
  const hasOverride = Object.hasOwn(settings.repositoryColors, repository.id);
  const color = parseHexColorOrThrow(
    hasOverride ? settings.repositoryColors[repository.id] : repositoryColor.default
  );
  const [picker, setPicker] = useState<RepositoryColorPickerState>(
    createRepositoryColorPickerState
  );

  return (
    <Popover
      placement="bottom-start"
      anchor={({ toggle }) => (
        <button
          aria-label={`Change color for ${repository.owner}/${repository.name}`}
          className={styles.repositoryColorSwatch}
          style={{ backgroundColor: color }}
          type="button"
          onClick={toggle}
        />
      )}
    >
      <div onPointerDown={event => event.stopPropagation()}>
        <RepositoryColorPicker
          color={color}
          hasOverride={hasOverride}
          picker={picker}
          repository={repository}
          repositoryColorTones={repositoryColorTones}
          settings={settings}
          setPicker={setPicker}
        />
      </div>
    </Popover>
  );
}

/*** Renders the ZORA-controlled picker while Atlas persists only its canonical primary color. */
function RepositoryColorPicker({
  color,
  hasOverride,
  picker,
  repository,
  repositoryColorTones,
  settings,
  setPicker,
}: RepositoryColorPickerProps) {
  return (
    <div style={COLOR_PICKER_STYLE}>
      <ColorPicker
        activeTab={picker.activeTab}
        harmony={picker.harmony}
        primaryColor={color}
        tabs={['grid', 'wheel']}
        testID={`repository-color-picker-${repository.id}`}
        tone={picker.tone}
        tones={repositoryColorTones}
        width={560}
        onActiveTabChange={activeTab => setPicker({ ...picker, activeTab })}
        onValueChange={nextValue => {
          setPicker({ ...picker, harmony: nextValue.harmony, tone: nextValue.tone });
          settings.setRepositoryColor(repository.id, nextValue.primaryColor.toUpperCase());
        }}
      />
      <Button
        disabled={!hasOverride}
        size="s"
        variant="ghost"
        onPress={() => resetRepositoryColor(settings, repository.id, setPicker)}
      >
        Reset color
      </Button>
    </div>
  );
}

/*** Clear a saved repository color and return its controlled picker to the canonical default. */
function resetRepositoryColor(
  settings: SettingsContextValue,
  repositoryId: string,
  setPicker: (picker: RepositoryColorPickerState) => void
): void {
  settings.setRepositoryColor(repositoryId, undefined);
  setPicker(createRepositoryColorPickerState());
}

/*** Create the locally controlled presentation state around Atlas's persisted primary color. */
function createRepositoryColorPickerState(): RepositoryColorPickerState {
  return { activeTab: 'grid' };
}

interface RepositoryColorPickerState {
  readonly activeTab: ColorPickerTab;
  readonly harmony?: ColorHarmony;
  readonly tone?: string;
}

interface RepositoryColorPickerProps {
  readonly color: ReturnType<typeof parseHexColorOrThrow>;
  readonly hasOverride: boolean;
  readonly picker: RepositoryColorPickerState;
  readonly repository: WorkspaceRepositoryOption;
  readonly repositoryColorTones: readonly ColorToneDefinition[];
  readonly settings: SettingsContextValue;
  readonly setPicker: (picker: RepositoryColorPickerState) => void;
}

const COLOR_PICKER_STYLE = {
  maxHeight: 360,
  overflowY: 'auto',
  padding: 8,
} as const;
