'use client';
import { parseHexColorOrThrow } from '@ankhorage/color-theory';
import { Popover } from '@ankhorage/surface/browser';
import type { ColorPickerSelection, ColorPickerValue, ColorToneDefinition } from '@ankhorage/zora';
import { Button } from '@ankhorage/zora/web/button';
import { ColorPicker } from '@ankhorage/zora/web/color-picker';
import { Surface } from '@ankhorage/zora/web/surface';
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
  const [value, setValue] = useState<ColorPickerValue>(() => createColorPickerValue(color));

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
      <Surface style={{ padding: 8 }} variant="raised">
        <ColorPicker
          tabs={['wheel', 'tone']}
          testID={`repository-color-picker-${repository.id}`}
          tone={{ selectionMode: 'single', tones: repositoryColorTones }}
          value={value}
          wheel={{}}
          onSelectionChange={(selection: ColorPickerSelection) =>
            setRepositoryColor(settings, repository.id, selection)
          }
          onValueChange={(nextValue: ColorPickerValue) => setValue(nextValue)}
        />
        <Button
          disabled={!hasOverride}
          size="s"
          variant="ghost"
          onPress={() => settings.setRepositoryColor(repository.id, undefined)}
        >
          Reset color
        </Button>
      </Surface>
    </Popover>
  );
}

/*** Create the controlled Wheel and Tone state from the current canonical repository color. */
function createColorPickerValue(color: ColorPickerValue['wheel']['color']): ColorPickerValue {
  return {
    hue: color,
    tab: 'wheel',
    tone: null,
    wheel: { color, harmony: null },
  };
}

/*** Persist the Picker's one active Wheel or single Tone color as a canonical uppercase override. */
function setRepositoryColor(
  settings: SettingsContextValue,
  repositoryId: string,
  selection: ColorPickerSelection
): void {
  const color =
    selection.mode === 'wheel'
      ? selection.value.color
      : selection.mode === 'tone'
        ? selection.value.colors.at(0)
        : undefined;
  if (color !== undefined) settings.setRepositoryColor(repositoryId, color.toUpperCase());
}
