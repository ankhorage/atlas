# OAuth persistence deployment

Atlas requires an existing PostgreSQL database. Apply
`database/migrations/001_atlas_oauth.sql` through the database provider's deployment migration
pipeline before enabling OAuth. The migration creates private `atlas_oauth` tables and revokes
unintended access; do not expose this schema through any public database API.

Create a dedicated login role with only `USAGE` on `atlas_oauth` and `SELECT`, `INSERT`, `UPDATE`,
and `DELETE` on its two tables. Store its TLS connection string in the actual Atlas hosting secret
store as `ATLAS_OAUTH_DATABASE_URL`. Use a PostgreSQL URL that verifies the database server's
public CA and hostname (for example, `sslmode=verify-full` where supported by the provider). Never
provide this value or any database credential to the browser.

Set these server-only secrets in the existing Atlas deployment's secret store:

- `ATLAS_GITHUB_OAUTH_CLIENT_ID`
- `ATLAS_GITHUB_OAUTH_CLIENT_SECRET`
- `ATLAS_OAUTH_DATABASE_URL`
- `ATLAS_OAUTH_ENCRYPTION_KEY` — exactly 32 random bytes encoded with standard Base64

Generate the encryption key once in a secure operator environment, retain it for restarts, and
plan a deliberate migration before rotating it. Atlas refuses to start OAuth persistence when the
key is absent or malformed. Register the exact production callback
`https://atlas.ankhorage.com/api/auth/github/callback`; preserve the existing OAuth App callbacks.
