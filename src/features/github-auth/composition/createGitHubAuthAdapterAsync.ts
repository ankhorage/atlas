import type { AuthPort } from '@ankhorage/auth';
import { createGitHubAuthAdapter } from '@ankhorage/auth-github';

import { githubAuthConfiguration } from '@/features/github-auth/application/githubAuthConfiguration';
import type { GitHubAuthPersistence } from '@/features/github-auth/ports/githubAuthPersistence';

/*** Compose a request-scoped GitHub adapter only from trusted server configuration and durable storage. */
export async function createGitHubAuthAdapterAsync(
  sessionId: string
): Promise<GitHubAuthAdapterAvailability> {
  const configuration = readGitHubAuthEnvironment();
  if (configuration === null)
    return { available: false, message: 'GitHub sign-in is not configured.' };

  try {
    const persistence = await loadGitHubAuthPersistenceAsync(configuration.persistenceModule);
    return {
      adapter: createGitHubAuthAdapter({
        authorizationAttempts: persistence.createAuthorizationAttemptStore(sessionId),
        clientId: configuration.clientId,
        clientSecret: configuration.clientSecret,
        redirectUris: [githubAuthConfiguration.callbackUrl],
        sessions: persistence.createSessionStore(sessionId),
      }),
      available: true,
    };
  } catch {
    return { available: false, message: 'GitHub sign-in is temporarily unavailable.' };
  }
}

/*** Read secrets only on the server and reject partial OAuth configuration rather than degrading to shared credentials. */
function readGitHubAuthEnvironment(): GitHubAuthEnvironment | null {
  const clientId = process.env.ATLAS_GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.ATLAS_GITHUB_OAUTH_CLIENT_SECRET;
  const persistenceModule = process.env.ATLAS_GITHUB_AUTH_PERSISTENCE_MODULE;
  return clientId && clientSecret && persistenceModule
    ? { clientId, clientSecret, persistenceModule }
    : null;
}

/*** Load a deployment-owned persistence adapter without importing a sibling repository or providing an unsafe fallback. */
async function loadGitHubAuthPersistenceAsync(
  persistenceModule: string
): Promise<GitHubAuthPersistence> {
  const loaded: unknown = await import(persistenceModule);
  if (!isGitHubAuthPersistenceModule(loaded))
    throw new Error('Invalid GitHub auth persistence module.');
  return loaded.createGitHubAuthPersistence();
}

/*** Validate the narrow runtime boundary before confidential OAuth state is handled. */
function isGitHubAuthPersistenceModule(
  value: unknown
): value is { readonly createGitHubAuthPersistence: () => GitHubAuthPersistence } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'createGitHubAuthPersistence' in value &&
    typeof value.createGitHubAuthPersistence === 'function'
  );
}

interface GitHubAuthEnvironment {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly persistenceModule: string;
}

export type GitHubAuthAdapterAvailability =
  | { readonly adapter: AuthPort; readonly available: true }
  | { readonly available: false; readonly message: string };
