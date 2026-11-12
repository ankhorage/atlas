'use client';
import { IconButton } from '@ankhorage/zora/web/button';
import type { GraphViewController } from '@ankhorage/zora/web/graph-view';
import { useZoraTheme } from '@ankhorage/zora/web/runtime';
import { Text } from '@ankhorage/zora/web/text';
import { View } from '@ankhorage/zora/web/view';
import React, { type ChangeEvent } from 'react';

interface GraphZoomControlsProps {
  readonly controller: GraphViewController | null;
  readonly maxZoom: number;
  readonly minZoom: number;
  readonly onFit: () => void;
  readonly zoom: number;
}

/*** Renders graph zoom controls through ZORA except for the retained range slider. */
export function GraphZoomControls({
  controller,
  maxZoom,
  minZoom,
  onFit,
  zoom,
}: GraphZoomControlsProps) {
  const { theme } = useZoraTheme();

  /*** Applies one slider zoom value through the GraphView controller. */
  const handleSliderChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (controller === null) return;
    const level = Number.parseFloat(event.target.value);
    controller.setZoom(Math.min(maxZoom, Math.max(minZoom, level)));
  };

  return (
    <View align="center" direction="row" gap="s" justify="center" p="m">
      <Text variant="bodySmall">Zoom:</Text>
      <IconButton
        color="neutral"
        icon={{ name: 'scan-outline' }}
        label="Fit graph and optimize spacing for readability"
        size="s"
        variant="ghost"
        onPress={onFit}
      />
      <input
        id="zoom"
        type="range"
        min={minZoom}
        max={maxZoom}
        step="any"
        value={zoom}
        onChange={handleSliderChange}
        aria-label="Zoom"
        style={{
          accentColor: theme.semantics.brand.base,
          cursor: 'pointer',
          width: 256,
        }}
      />
      <Text variant="caption">{(zoom * 100).toFixed(0)}%</Text>
    </View>
  );
}
