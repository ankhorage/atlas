import type { ZoraRuntimeTheme } from '@ankhorage/zora/web/runtime';

/*** Resolves stable cycle highlight colors exclusively from active ZORA danger semantics. */
export function createCycleThemeColors(theme: ZoraRuntimeTheme): readonly string[] {
  return [
    theme.semantics.danger.base,
    theme.semantics.danger.strong,
    theme.semantics.danger.hover,
    theme.semantics.danger.outline,
    theme.semantics.error.base,
    theme.semantics.error.strong,
    theme.semantics.error.hover,
    theme.semantics.error.outline,
  ];
}
