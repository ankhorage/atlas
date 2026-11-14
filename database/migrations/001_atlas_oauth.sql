CREATE SCHEMA IF NOT EXISTS atlas_oauth;

REVOKE ALL ON SCHEMA atlas_oauth FROM PUBLIC;

CREATE TABLE IF NOT EXISTS atlas_oauth.authorization_attempts (
  attempt_id_hash text PRIMARY KEY,
  browser_session_id_hash text NOT NULL,
  encrypted_payload text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS authorization_attempts_expiry_idx
  ON atlas_oauth.authorization_attempts (expires_at);

CREATE TABLE IF NOT EXISTS atlas_oauth.sessions (
  session_id_hash text PRIMARY KEY,
  encrypted_payload text NOT NULL,
  expires_at timestamptz,
  encryption_key_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON ALL TABLES IN SCHEMA atlas_oauth FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA atlas_oauth FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA atlas_oauth FROM authenticated;
  END IF;
END;
$$;
