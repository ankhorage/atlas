import type { WorkspaceAnalysisCacheKey } from '@/types/workspace';

/*** Create bounded in-memory discovery and immutable-revision analysis caches for one browser session. */
export function createWorkspaceAnalysisCache<Value>(
  maximumEntries: number
): WorkspaceAnalysisCache<Value> {
  if (!Number.isInteger(maximumEntries) || maximumEntries < 1) {
    throw new Error('Workspace analysis cache requires at least one entry.');
  }
  const discovery = new Map<string, unknown>();
  const analysis = new Map<string, Value>();
  return {
    clearRepository: repositoryId => {
      for (const key of analysis.keys()) {
        if (key.includes(`|${repositoryId}|`)) analysis.delete(key);
      }
    },
    getAnalysis: key => readMostRecent(analysis, serializeAnalysisKey(key)),
    getDiscovery: key => readMostRecent(discovery, key),
    setAnalysis: (key, value) =>
      writeBounded(analysis, serializeAnalysisKey(key), value, maximumEntries),
    setDiscovery: (key, value) => writeBounded(discovery, key, value, maximumEntries),
  };
}

/*** Serialize all authorization, provider, repository, revision, and schema dimensions into a cache key. */
function serializeAnalysisKey(key: WorkspaceAnalysisCacheKey): string {
  return [key.authorization, key.provider, key.repositoryId, key.revision, key.schemaVersion].join(
    '|'
  );
}

/*** Read an entry and promote it so bounded eviction preserves recently reopened workspaces. */
function readMostRecent<Value>(entries: Map<string, Value>, key: string): Value | undefined {
  const value = entries.get(key);
  if (value === undefined) return undefined;
  entries.delete(key);
  entries.set(key, value);
  return value;
}

/*** Insert an entry and evict the least recently used value when the explicit cache bound is exceeded. */
function writeBounded<Value>(
  entries: Map<string, Value>,
  key: string,
  value: Value,
  maximumEntries: number
): void {
  entries.delete(key);
  entries.set(key, value);
  while (entries.size > maximumEntries) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) return;
    entries.delete(oldest);
  }
}

export interface WorkspaceAnalysisCache<Value> {
  readonly clearRepository: (repositoryId: string) => void;
  readonly getAnalysis: (key: WorkspaceAnalysisCacheKey) => Value | undefined;
  readonly getDiscovery: (key: string) => unknown;
  readonly setAnalysis: (key: WorkspaceAnalysisCacheKey, value: Value) => void;
  readonly setDiscovery: (key: string, value: unknown) => void;
}
