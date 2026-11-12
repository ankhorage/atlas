import type { ZoraRuntimeTheme } from '@ankhorage/zora/web/runtime';

export interface GraphPalette {
  readonly canvasBg: string;
  readonly compoundBg: string;
  readonly edge: string;
  readonly nodeBg: string;
  readonly nodeBgVendor: string;
  readonly nodeBgWorkspaceRoot: string;
  readonly nodeBorder: string;
  readonly nodeBorderVendor: string;
  readonly nodeBorderWorkspaceRoot: string;
  readonly nodeText: string;
  readonly nodeTextVendor: string;
  readonly nodeTextWorkspaceRoot: string;
  readonly selectedFill: string;
  readonly selectedRing: string;
  readonly selectedText: string;
  readonly repositoryColors: readonly GraphRepositoryColor[];
  readonly weightMd: string;
  readonly weightXl: string;
  readonly weightXs: string;
}

interface GraphRepositoryColor {
  readonly background: string;
  readonly border: string;
  readonly text: string;
}

/*** Maps the active ZORA theme semantics into Atlas graph presentation roles. */
export function getGraphPalette(theme: ZoraRuntimeTheme): GraphPalette {
  return {
    canvasBg: theme.semantics.surface.default,
    compoundBg: theme.semantics.surface.subtle,
    edge: theme.semantics.content.muted,
    nodeBg: theme.semantics.brand.softBg,
    nodeBgVendor: theme.semantics.secondary.softBg,
    nodeBgWorkspaceRoot: theme.semantics.accent.softBg,
    nodeBorder: theme.semantics.brand.outline,
    nodeBorderVendor: theme.semantics.secondary.outline,
    nodeBorderWorkspaceRoot: theme.semantics.accent.outline,
    nodeText: theme.semantics.brand.onSoftText,
    nodeTextVendor: theme.semantics.secondary.onSoftText,
    nodeTextWorkspaceRoot: theme.semantics.accent.onSoftText,
    selectedFill: theme.semantics.selection.background,
    selectedRing: theme.semantics.selection.border,
    selectedText: theme.semantics.selection.content,
    repositoryColors: [
      theme.semantics.brand,
      theme.semantics.secondary,
      theme.semantics.accent,
      theme.semantics.highlight,
      theme.semantics.success,
      theme.semantics.warning,
      theme.semantics.info,
    ].map(role => ({
      background: role.softBg,
      border: role.outline,
      text: role.onSoftText,
    })),
    weightMd: theme.semantics.border.strong,
    weightXl: theme.semantics.content.default,
    weightXs: theme.semantics.border.subtle,
  };
}
