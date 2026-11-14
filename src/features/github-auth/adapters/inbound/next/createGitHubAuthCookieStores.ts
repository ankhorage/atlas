import type {
  GitHubAuthorizationAttempt,
  GitHubAuthorizationAttemptStore,
  GitHubSessionStore,
} from '@ankhorage/auth-github';
import type { AuthSession } from '@ankhorage/contracts/auth';

/*** Adapt one request's encrypted cookie values to the published GitHub adapter stores without introducing a provider-specific OAuth flow. */
export function createGitHubAuthCookieStores(
  input: GitHubAuthCookieStoreInput
): GitHubAuthCookieStores {
  let { authorizationAttempt, session } = input;
  return {
    authorizationAttempts: {
      create: attempt => {
        if (authorizationAttempt !== undefined)
          throw new Error('GitHub authorization attempt exists.');
        authorizationAttempt = attempt;
        return Promise.resolve();
      },
      consume: (attemptId, now) => {
        const candidate = authorizationAttempt;
        authorizationAttempt = undefined;
        return Promise.resolve(
          candidate?.attemptId === attemptId && candidate.expiresAt > now ? candidate : null
        );
      },
      purgeExpired: now => {
        if (authorizationAttempt !== undefined && authorizationAttempt.expiresAt <= now)
          authorizationAttempt = undefined;
        return Promise.resolve();
      },
    },
    readAuthorizationAttempt: () => authorizationAttempt,
    sessions: {
      clear: () => {
        session = undefined;
        return Promise.resolve();
      },
      get: () => Promise.resolve(session ?? null),
      save: nextSession => {
        session = nextSession;
        return Promise.resolve();
      },
    },
  };
}

interface GitHubAuthCookieStoreInput {
  readonly authorizationAttempt?: GitHubAuthorizationAttempt;
  readonly session?: AuthSession;
}

interface GitHubAuthCookieStores {
  readonly authorizationAttempts: GitHubAuthorizationAttemptStore;
  readonly readAuthorizationAttempt: () => GitHubAuthorizationAttempt | undefined;
  readonly sessions: GitHubSessionStore;
}
