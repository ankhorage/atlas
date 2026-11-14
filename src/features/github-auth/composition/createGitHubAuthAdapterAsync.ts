import type { AuthPort } from '@ankhorage/auth';
import { createGitHubAuthAdapter } from '@ankhorage/auth-github';
import type { AuthSession } from '@ankhorage/contracts/auth';

import { createPostgresGitHubAuthPersistence } from '@/features/github-auth/adapters/outbound/postgres/createPostgresGitHubAuthPersistence';
import { githubAuthConfiguration } from '@/features/github-auth/application/githubAuthConfiguration';

let cachedPersistence: CachedGitHubAuthPersistence | undefined;

/*** Compose a request-scoped GitHub adapter only from trusted server configuration and durable storage. */
export function createGitHubAuthAdapterAsync(
  sessionId: string
): Promise<GitHubAuthAdapterAvailability> {
  const configuration = readGitHubAuthEnvironment();
  if (configuration === null)
    return Promise.resolve({ available: false, message: 'GitHub sign-in is not configured.' });

  try {
    const persistence = getGitHubAuthPersistence(configuration);
    return Promise.resolve({
      adapter: createGitHubAuthAdapter({
        authorizationMode: 'oauth-app',
        authorizationAttempts: persistence.createAuthorizationAttemptStore(sessionId),
        clientId: configuration.clientId,
        clientSecret: configuration.clientSecret,
        redirectUris: [githubAuthConfiguration.callbackUrl],
        sessions: persistence.createSessionStore(sessionId),
      }),
      available: true,
    });
  } catch {
    return Promise.resolve({
      available: false,
      message: 'GitHub sign-in is temporarily unavailable.',
    });
  }
}

/*** Rotate the opaque browser identifier after successful authorization so the pre-login session cannot authorize later requests. */
export async function rotateGitHubAuthSessionAsync(
  previousSessionId: string,
  nextSessionId: string,
  session: AuthSession
): Promise<void> {
  const configuration = readGitHubAuthEnvironment();
  if (configuration === null) throw new Error('GitHub sign-in is not configured.');
  const persistence = getGitHubAuthPersistence(configuration);
  await persistence.rotateSessionAsync(previousSessionId, nextSessionId, session);
}

/*** Reuse one bounded server-side connection pool for identical deployment configuration. */
function getGitHubAuthPersistence(configuration: GitHubAuthEnvironment) {
  if (
    cachedPersistence?.databaseUrl === configuration.databaseUrl &&
    cachedPersistence.encryptionKey === configuration.encryptionKey
  )
    return cachedPersistence.persistence;
  const persistence = createPostgresGitHubAuthPersistence({
    databaseUrl: configuration.databaseUrl,
    encryptionKey: configuration.encryptionKey,
  });
  cachedPersistence = { ...configuration, persistence };
  return persistence;
}

/*** Read secrets only on the server and reject partial OAuth configuration rather than degrading to shared credentials. */
function readGitHubAuthEnvironment(): GitHubAuthEnvironment | null {
  const clientId = process.env.ATLAS_GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.ATLAS_GITHUB_OAUTH_CLIENT_SECRET;
  const databaseUrl = process.env.ATLAS_OAUTH_DATABASE_URL;
  const encryptionKey = process.env.ATLAS_OAUTH_ENCRYPTION_KEY;
  return clientId && clientSecret && databaseUrl && encryptionKey
    ? { clientId, clientSecret, databaseUrl, encryptionKey }
    : null;
}

interface GitHubAuthEnvironment {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly databaseUrl: string;
  readonly encryptionKey: string;
}

interface CachedGitHubAuthPersistence extends GitHubAuthEnvironment {
  readonly persistence: ReturnType<typeof createPostgresGitHubAuthPersistence>;
}

export type GitHubAuthAdapterAvailability =
  | { readonly adapter: AuthPort; readonly available: true }
  | { readonly available: false; readonly message: string };
