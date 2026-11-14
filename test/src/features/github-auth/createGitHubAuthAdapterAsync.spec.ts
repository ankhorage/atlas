import { assert, describe, it } from '@artiphishle/testosterone';

import { createGitHubAuthAdapterAsync } from '@/features/github-auth/composition/createGitHubAuthAdapterAsync';

describe('[GitHub auth adapter composition]', () => {
  it('fails closed when the cookie encryption key is absent', async () => {
    const previousKey = process.env.ATLAS_GITHUB_OAUTH_COOKIE_ENCRYPTION_KEY;
    const previousClientId = process.env.ATLAS_GITHUB_OAUTH_CLIENT_ID;
    const previousClientSecret = process.env.ATLAS_GITHUB_OAUTH_CLIENT_SECRET;
    process.env.ATLAS_GITHUB_OAUTH_CLIENT_ID = 'client-id';
    process.env.ATLAS_GITHUB_OAUTH_CLIENT_SECRET = 'client-secret';
    delete process.env.ATLAS_GITHUB_OAUTH_COOKIE_ENCRYPTION_KEY;

    try {
      const auth = await createGitHubAuthAdapterAsync();
      assert.deepEqual(auth, {
        available: false,
        message: 'GitHub sign-in is temporarily unavailable.',
      });
    } finally {
      restoreEnvironmentValue('ATLAS_GITHUB_OAUTH_COOKIE_ENCRYPTION_KEY', previousKey);
      restoreEnvironmentValue('ATLAS_GITHUB_OAUTH_CLIENT_ID', previousClientId);
      restoreEnvironmentValue('ATLAS_GITHUB_OAUTH_CLIENT_SECRET', previousClientSecret);
    }
  });
});

/*** Restore a test environment variable without converting an absent value into a string. */
function restoreEnvironmentValue(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
