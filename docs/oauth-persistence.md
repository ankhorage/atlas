# OAuth persistence deployment

Atlas uses a dedicated Supabase project named `atlas-prod` in `eu-central-2`. Apply
`database/migrations/001_atlas_oauth.sql` through the deployment migration pipeline before
enabling OAuth. The migration creates private `atlas_oauth` tables and removes `PUBLIC`, `anon`,
and `authenticated` access; do not expose this schema in Supabase's Data API.

Create a dedicated login role with only `USAGE` on `atlas_oauth` and `SELECT`, `INSERT`, `UPDATE`,
and `DELETE` on its two tables. Store its TLS connection string in the actual Atlas hosting secret
store as `ATLAS_OAUTH_DATABASE_URL`. The server process must use the Supabase transaction pooler
or a direct/session-pooler connection with a publicly trusted server certificate. Never provide
this value or a Supabase service-role key to the browser.

Set these server-only secrets in the existing Atlas deployment's secret store:

- `ATLAS_GITHUB_OAUTH_CLIENT_ID`
- `ATLAS_GITHUB_OAUTH_CLIENT_SECRET`
- `ATLAS_OAUTH_DATABASE_URL`
- `ATLAS_OAUTH_ENCRYPTION_KEY` — exactly 32 random bytes encoded with standard Base64

Generate the encryption key once in a secure operator environment, retain it for restarts, and
plan a deliberate migration before rotating it. Atlas refuses to start OAuth persistence when the
key is absent or malformed. Register the exact production callback
`https://atlas.ankhorage.com/api/auth/github/callback`; preserve the existing OAuth App callbacks.
