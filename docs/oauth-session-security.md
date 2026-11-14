# GitHub OAuth cookie session

Atlas uses the published `@ankhorage/auth-github` adapter and stores only its host session and OAuth
attempt in encrypted, authenticated `__Host-` cookies. On Vercel, configure these server-only values:

- `ATLAS_GITHUB_OAUTH_CLIENT_ID`
- `ATLAS_GITHUB_OAUTH_CLIENT_SECRET`
- `ATLAS_GITHUB_OAUTH_COOKIE_ENCRYPTION_KEY` — a stable Base64-encoded 32-byte key

Register exactly `https://atlas.ankhorage.com/api/auth/github/callback`. The adapter validates the
allowlisted callback and OAuth state. Atlas uses HTTPS, `HttpOnly`, `SameSite=Lax`, host-only cookies;
attempts expire after ten minutes and sessions expire after at most eight hours (or earlier when
GitHub supplies an earlier expiry). Tokens are never placed in client code, URLs, telemetry, or
workspace data.

This is deliberately stateless. It does not provide an atomic, cross-instance consume operation for
parallel callback replays, nor can logout revoke a copied cookie or a GitHub authorization grant.
GitHub's authorization code is single-use, and logout clears the current browser's local cookie only.
A shared, transactional store and a released provider-revocation capability are required before
claiming server-wide replay protection or revocation. Users must reauthorize after expiry; Atlas does
not silently substitute a shared or environment GitHub credential.
