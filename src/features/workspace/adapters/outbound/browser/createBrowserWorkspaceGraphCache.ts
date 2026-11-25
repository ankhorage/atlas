import type { WorkspaceLoadResult } from '@/types/workspace';

/*** Stores the last successfully rendered graph for one credential-free browser selection. */
export function createBrowserWorkspaceGraphCache(storage: Storage): BrowserWorkspaceGraphCache {
  return {
    load(key) {
      try {
        const value: unknown = JSON.parse(storage.getItem(CACHE_KEY) ?? 'null');
        return isEntry(value) && value.key === key ? value : undefined;
      } catch {
        return undefined;
      }
    },
    save(entry) {
      try {
        const encoded = JSON.stringify(entry);
        if (encoded.length <= MAX_CACHE_CHARACTERS) storage.setItem(CACHE_KEY, encoded);
      } catch {
        // Browser privacy settings and quota failures leave the live workspace unaffected.
      }
    },
  };
}

export function createWorkspaceGraphCacheKey(
  source: string,
  repositoryIds: readonly string[]
): string {
  return `${source.trim().toLowerCase()}|${[...repositoryIds].toSorted().join(',')}`;
}

interface BrowserWorkspaceGraphCacheEntry {
  readonly key: string;
  readonly projectName: string;
  readonly version: 1;
  readonly workspace: Extract<WorkspaceLoadResult, { readonly ok: true }>;
}

interface BrowserWorkspaceGraphCache {
  load(key: string): BrowserWorkspaceGraphCacheEntry | undefined;
  save(entry: BrowserWorkspaceGraphCacheEntry): void;
}

function isEntry(value: unknown): value is BrowserWorkspaceGraphCacheEntry {
  if (!isRecord(value) || value.version !== 1) return false;
  return (
    validText(value.key, 2048) &&
    validText(value.projectName, 512) &&
    isSuccessfulWorkspace(value.workspace)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function validText(value: unknown, maximum: number): boolean {
  return typeof value === 'string' && value.length <= maximum;
}

function isSuccessfulWorkspace(value: unknown): boolean {
  return isRecord(value) && value.ok === true && 'value' in value;
}

const CACHE_KEY = 'atlas.workspace-graph.v1';
const MAX_CACHE_CHARACTERS = 4_000_000;
