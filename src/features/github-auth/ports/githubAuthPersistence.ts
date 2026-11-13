import type { GitHubAuthorizationAttemptStore, GitHubSessionStore } from '@ankhorage/auth-github';

/*** Define the host-owned durable storage boundary required by the published GitHub OAuth adapter. */
export interface GitHubAuthPersistence {
  createAuthorizationAttemptStore(sessionId: string): GitHubAuthorizationAttemptStore;
  createSessionStore(sessionId: string): GitHubSessionStore;
}
