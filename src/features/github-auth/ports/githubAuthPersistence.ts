import type { GitHubAuthorizationAttemptStore, GitHubSessionStore } from '@ankhorage/auth-github';
import type { AuthSession } from '@ankhorage/contracts/auth';

/*** Define the host-owned durable storage boundary required by the published GitHub OAuth adapter. */
export interface GitHubAuthPersistence {
  createAuthorizationAttemptStore(sessionId: string): GitHubAuthorizationAttemptStore;
  createSessionStore(
    sessionId: string,
    writeState?: GitHubAuthSessionWriteState
  ): GitHubSessionStore;
  rotateSessionAsync(
    previousSessionId: string,
    nextSessionId: string,
    session: AuthSession
  ): Promise<void>;
}

export type GitHubAuthSessionWriteState = 'active' | 'pending';
