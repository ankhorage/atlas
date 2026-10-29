import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Audit } from '@/types/audit';
import type { WorkspaceSnapshot } from '@/types/workspace';

/*** Creates one CSP-protected HTML file containing the real Atlas workspace and one validated snapshot. */
export async function createOfflineHtmlReportAsync(audit: Audit): Promise<string> {
  const resources = await readOfflineWorkspaceBundleAsync();
  const snapshot = { audit, version: 1 } as const;
  assertPortableSnapshot(snapshot);

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; media-src 'none'; object-src 'none'; worker-src blob:; base-uri 'none'; form-action 'none'\">",
    '<meta name="generator" content="Ankhorage Atlas">',
    '<title>Atlas Offline Workspace</title>',
    '<style>',
    escapeInlineStyle(resources.css),
    '</style>',
    '</head>',
    '<body>',
    '<div id="atlas-offline-root" aria-live="polite"></div>',
    '<script id="atlas-workspace-snapshot" type="application/json">',
    serializeSnapshot(snapshot),
    '</script>',
    '<script>',
    escapeInlineScript(resources.javascript),
    '</script>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/*** Reads the release-built browser bundle rather than depending on the export host at runtime. */
async function readOfflineWorkspaceBundleAsync(): Promise<OfflineWorkspaceBundle> {
  const bundleDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../offline');
  try {
    const [css, javascript] = await Promise.all([
      readFile(resolve(bundleDirectory, 'atlas-workspace.css'), 'utf8'),
      readFile(resolve(bundleDirectory, 'atlas-workspace.js'), 'utf8'),
    ]);
    return { css, javascript };
  } catch {
    throw new Error(
      'Atlas offline workspace bundle is unavailable. Run "bun run build" before export.'
    );
  }
}

interface OfflineWorkspaceBundle {
  readonly css: string;
  readonly javascript: string;
}

/*** Rejects host-bound or credential-bearing values before the portable snapshot crosses the export boundary. */
function assertPortableSnapshot(snapshot: WorkspaceSnapshot): void {
  assertPortableValue(snapshot, 'workspace snapshot');
  const sourceUrl = snapshot.audit.meta.source?.url;
  if (sourceUrl !== undefined && !isSafeRepositoryUrl(sourceUrl)) {
    throw new Error(
      'Atlas offline workspace snapshots require a public HTTPS GitHub repository URL.'
    );
  }
}

/*** Walks serializable audit evidence without treating project-relative source identities as host paths. */
function assertPortableValue(value: unknown, location: string): void {
  if (typeof value === 'string') {
    if (isPortablePathLocation(location) && isForbiddenHostPath(value)) {
      throw new Error(`Atlas offline workspace snapshot contains a host path at ${location}.`);
    }
    if (containsSensitiveAssignment(value)) {
      throw new Error(`Atlas offline workspace snapshot contains sensitive data at ${location}.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPortableValue(entry, `${location}[${index}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) =>
      assertPortableValue(entry, `${location}.${key}`)
    );
  }
}

/*** Limits host-path checks to provenance and source-file fields so logical SourceGraph paths remain portable. */
function isPortablePathLocation(location: string): boolean {
  return location.endsWith('.meta.projectName') || location.endsWith('.filePath');
}

/*** Identifies absolute local filesystem references across the supported host path syntaxes. */
function isForbiddenHostPath(value: string): boolean {
  const candidate = value.trim();
  return isAbsolute(candidate) || win32.isAbsolute(candidate) || isFileUrl(candidate);
}

/*** Recognizes file URLs independently of whether a host uses the two- or three-slash spelling. */
function isFileUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'file:';
  } catch {
    return false;
  }
}

/*** Rejects assignment-shaped secrets without misclassifying ordinary source identifiers or provenance. */
function containsSensitiveAssignment(value: string): boolean {
  return /\b(?:api[_-]?key|password|secret|token)\b\s*[=:]\s*\S+/iu.test(value);
}

/*** Allows only the user-selected public GitHub source URL that Atlas records in audit provenance. */
function isSafeRepositoryUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
}

/*** Preserves CSS bytes while preventing the HTML parser from closing the inline style element. */
function escapeInlineStyle(css: string): string {
  return css.replace(/<\/style/giu, '<\\/style');
}

/*** Preserves JavaScript semantics while preventing the HTML parser from closing the inline script. */
function escapeInlineScript(javascript: string): string {
  return javascript.replace(/<\/script/giu, '<\\/script');
}

/*** Serializes untrusted project data safely inside a non-executable JSON script element. */
function serializeSnapshot(snapshot: WorkspaceSnapshot): string {
  return JSON.stringify(snapshot)
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}
