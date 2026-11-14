/*** Creates the browser-local persistence boundary for the nonsecret active workspace selection. */
export function createBrowserWorkspaceSessionStore(storage: Storage): BrowserWorkspaceSessionStore {
  return {
    load: () => {
      try {
        const value: unknown = JSON.parse(storage.getItem(WORKSPACE_SESSION_STORAGE_KEY) ?? 'null');
        return isWorkspaceSession(value) ? value : undefined;
      } catch {
        return undefined;
      }
    },
    save: session => storage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify(session)),
  };
}

/*** Represents browser-restorable state without credentials, repository snapshots, or provider data. */
export interface BrowserWorkspaceSession {
  readonly selectedRepositoryIds: readonly string[];
  readonly source: string;
}

export interface BrowserWorkspaceSessionStore {
  readonly load: () => BrowserWorkspaceSession | undefined;
  readonly save: (session: BrowserWorkspaceSession) => void;
}

/*** Rejects malformed, oversized, or credential-shaped browser persistence before use. */
function isWorkspaceSession(value: unknown): value is BrowserWorkspaceSession {
  return (
    typeof value === 'object' &&
    value !== null &&
    'source' in value &&
    typeof value.source === 'string' &&
    value.source.length <= 512 &&
    !/^https?:\/\/[^/]*@/u.test(value.source) &&
    'selectedRepositoryIds' in value &&
    Array.isArray(value.selectedRepositoryIds) &&
    value.selectedRepositoryIds.length <= 100 &&
    value.selectedRepositoryIds.every(
      id => typeof id === 'string' && id.length > 0 && id.length <= 256
    )
  );
}

const WORKSPACE_SESSION_STORAGE_KEY = 'atlas.workspace-session.v1';
