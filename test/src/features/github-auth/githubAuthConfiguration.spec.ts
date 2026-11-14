import { assert, describe, it } from '@artiphishle/testosterone';

import {
  githubAuthConfiguration,
  githubAuthorizationScopes,
} from '@/features/github-auth/application/githubAuthConfiguration';

describe('[GitHub authorization scopes]', () => {
  it('uses public identity permission until private repository access is explicitly authorized', () => {
    assert.deepEqual(githubAuthorizationScopes(false), githubAuthConfiguration.publicScopes);
    assert.equal(githubAuthorizationScopes(false).includes('repo'), false);
    assert.equal(githubAuthorizationScopes(true).includes('repo'), true);
  });
});
