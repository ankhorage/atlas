/*** Recognizes the single-owner source scope accepted by workspace discovery and selection. */
export function isWorkspaceSelectionSource(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (value === '@me' || /^[A-Za-z\d](?:[A-Za-z\d-]{0,37}[A-Za-z\d])?$/u.test(value))
  );
}

/*** Canonicalizes equivalent owner spellings before they become a workspace runtime scope key. */
export function normalizeWorkspaceSelectionSource(source: string): string {
  return source === '@me' ? source : source.toLowerCase();
}
