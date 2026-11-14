import type { AuthPort } from '@ankhorage/auth';
import { createGitHubAuthAdapter, type GitHubAuthorizationAttempt } from '@ankhorage/auth-github';
import type { AuthSession } from '@ankhorage/contracts/auth';

import { createGitHubAuthCookieStores } from '@/features/github-auth/adapters/inbound/next/createGitHubAuthCookieStores';
import { githubAuthConfiguration } from '@/features/github-auth/application/githubAuthConfiguration';

/*** Compose the released GitHub adapter against request-scoped encrypted-cookie values. */
export function createGitHubAuthAdapterAsync(
  input: GitHubAuthAdapterInput = {}
): Promise<GitHubAuthAdapterAvailability> {
  const configuration = readGitHubAuthEnvironment();
  if (configuration === null)
    return Promise.resolve({ available: false, message: 'GitHub sign-in is not configured.' });

  try {
    const stores = createGitHubAuthCookieStores(input);
    return Promise.resolve({
      adapter: createGitHubAuthAdapter({
        authorizationMode: 'oauth-app',
        authorizationAttempts: stores.authorizationAttempts,
        clientId: configuration.clientId,
        clientSecret: configuration.clientSecret,
        redirectUris: [githubAuthConfiguration.callbackUrl],
        sessions: stores.sessions,
      }),
      available: true,
      readAuthorizationAttempt: stores.readAuthorizationAttempt,
    });
  } catch {
    return Promise.resolve({
      available: false,
      message: 'GitHub sign-in is temporarily unavailable.',
    });
  }
}

/*** Read secrets only on the server and reject partial OAuth configuration rather than degrading to shared credentials. */
function readGitHubAuthEnvironment(): GitHubAuthEnvironment | null {
  const clientId = process.env.ATLAS_GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.ATLAS_GITHUB_OAUTH_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

interface GitHubAuthEnvironment {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface GitHubAuthAdapterInput {
  readonly authorizationAttempt?: GitHubAuthorizationAttempt;
  readonly session?: AuthSession;
}

export type GitHubAuthAdapterAvailability =
  | {
      readonly adapter: AuthPort;
      readonly available: true;
      readonly readAuthorizationAttempt: () => GitHubAuthorizationAttempt | undefined;
    }
  | { readonly available: false; readonly message: string };
