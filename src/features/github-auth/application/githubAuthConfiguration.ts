/*** Keep the GitHub OAuth callback and requested permissions explicit and deployment-auditable. */
export const githubAuthConfiguration = {
  callbackUrl: 'https://atlas.ankhorage.com/api/auth/github/callback',
  publicScopes: ['read:user'],
  privateRepositoryScopes: ['read:user', 'repo'],
} as const;

/*** Select only the scopes the person explicitly consented to for this authorization attempt. */
export function githubAuthorizationScopes(privateRepositoryAccess: boolean): readonly string[] {
  return privateRepositoryAccess
    ? githubAuthConfiguration.privateRepositoryScopes
    : githubAuthConfiguration.publicScopes;
}
