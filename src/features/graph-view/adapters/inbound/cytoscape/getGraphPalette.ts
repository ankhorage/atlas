import type { ZoraRuntimeTheme } from '@zora/ZoraProvider';

export interface GraphPalette {
  readonly canvasBg: string;
  readonly compoundBg: string;
  readonly edge: string;
  readonly nodeBg: string;
  readonly nodeBgVendor: string;
  readonly nodeBorder: string;
  readonly nodeBorderVendor: string;
  readonly nodeText: string;
  readonly nodeTextVendor: string;
  readonly selectedFill: string;
  readonly selectedRing: string;
  readonly selectedText: string;
  readonly weightMd: string;
  readonly weightXl: string;
  readonly weightXs: string;
}

/*** Maps the active ZORA theme semantics into Atlas graph presentation roles. */
export function getGraphPalette(theme: ZoraRuntimeTheme): GraphPalette {
  return {
    canvasBg: theme.semantics.surface.default,
    compoundBg: theme.semantics.surface.subtle,
    edge: theme.semantics.content.muted,
    nodeBg: theme.semantics.brand.softBg,
    nodeBgVendor: theme.semantics.secondary.softBg,
    nodeBorder: theme.semantics.brand.outline,
    nodeBorderVendor: theme.semantics.secondary.outline,
    nodeText: theme.semantics.brand.onSoftText,
    nodeTextVendor: theme.semantics.secondary.onSoftText,
    selectedFill: theme.semantics.selection.background,
    selectedRing: theme.semantics.selection.border,
    selectedText: theme.semantics.selection.content,
    weightMd: theme.semantics.border.strong,
    weightXl: theme.semantics.content.default,
    weightXs: theme.semantics.border.subtle,
  };
}
