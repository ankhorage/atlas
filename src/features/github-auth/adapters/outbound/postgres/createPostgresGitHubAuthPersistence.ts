import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import type { GitHubAuthorizationAttempt } from '@ankhorage/auth-github';
import type { AuthSession } from '@ankhorage/contracts/auth';
import { Pool, type PoolClient } from 'pg';

import type {
  GitHubAuthPersistence,
  GitHubAuthSessionWriteState,
} from '@/features/github-auth/ports/githubAuthPersistence';

/*** Create encrypted, server-only PostgreSQL persistence for the GitHub OAuth port. */
export function createPostgresGitHubAuthPersistence(
  configuration: PostgresGitHubAuthPersistenceConfiguration
): GitHubAuthPersistence {
  const key = readEncryptionKey(configuration.encryptionKey);
  const pool = new Pool({
    connectionString: configuration.databaseUrl,
    max: 5,
    ssl: configuration.tls === false ? false : { rejectUnauthorized: true },
  });
  return {
    createAuthorizationAttemptStore: sessionId =>
      createAuthorizationAttemptStore(pool, key, sessionId),
    createSessionStore: (sessionId, writeState = 'active') =>
      createSessionStore(pool, key, sessionId, writeState),
    rotateSessionAsync: (previousSessionId, nextSessionId, session) =>
      rotateSessionAsync(pool, key, previousSessionId, nextSessionId, session),
  };
}

/*** Atomically replace the adapter-created pre-login session so crashes and database failures never authorize both cookie identifiers. */
async function rotateSessionAsync(
  pool: Pool,
  key: Buffer,
  previousSessionId: string,
  nextSessionId: string,
  session: AuthSession
): Promise<void> {
  if (previousSessionId === nextSessionId)
    throw new Error('GitHub OAuth session rotation requires a new identifier.');
  const previousSessionHash = hashOpaqueId(previousSessionId);
  const nextSessionHash = hashOpaqueId(nextSessionId);
  const payload = encryptPayload(session, key, sessionAad(nextSessionHash));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const previous = await client.query(
      'SELECT 1 FROM atlas_oauth.sessions WHERE session_id_hash = $1 FOR UPDATE',
      [previousSessionHash]
    );
    const next = await client.query(
      'SELECT 1 FROM atlas_oauth.sessions WHERE session_id_hash = $1 FOR UPDATE',
      [nextSessionHash]
    );
    if (previous.rowCount === 0) {
      if (next.rowCount === 0)
        throw new Error('GitHub OAuth session rotation source is unavailable.');
      await client.query('COMMIT');
      return;
    }
    if (next.rowCount !== 0)
      throw new Error('GitHub OAuth session rotation target already exists.');
    await saveSessionAsync(client, nextSessionHash, payload, session.expiresAt, 'active');
    await client.query('DELETE FROM atlas_oauth.sessions WHERE session_id_hash = $1', [
      previousSessionHash,
    ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function createAuthorizationAttemptStore(pool: Pool, key: Buffer, sessionId: string) {
  const sessionHash = hashOpaqueId(sessionId);
  return {
    create: async (attempt: GitHubAuthorizationAttempt): Promise<void> => {
      const attemptHash = hashOpaqueId(attempt.attemptId);
      const payload = encryptPayload(attempt, key, authorizationAttemptAad(sessionHash));
      await pool.query(
        `INSERT INTO atlas_oauth.authorization_attempts
          (attempt_id_hash, browser_session_id_hash, encrypted_payload, expires_at)
         VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))`,
        [attemptHash, sessionHash, payload, attempt.expiresAt]
      );
    },
    consume: async (attemptId: string, now: number): Promise<GitHubAuthorizationAttempt | null> => {
      const result = await pool.query<{ readonly encrypted_payload: string }>(
        `DELETE FROM atlas_oauth.authorization_attempts
         WHERE attempt_id_hash = $1
           AND browser_session_id_hash = $2
           AND expires_at > to_timestamp($3 / 1000.0)
         RETURNING encrypted_payload`,
        [hashOpaqueId(attemptId), sessionHash, now]
      );
      if (result.rowCount === 0) return null;
      const [row] = result.rows;
      return decryptPayload<GitHubAuthorizationAttempt>(
        row.encrypted_payload,
        key,
        authorizationAttemptAad(sessionHash)
      );
    },
    purgeExpired: async (now: number): Promise<void> => {
      await pool.query(
        'DELETE FROM atlas_oauth.authorization_attempts WHERE expires_at <= to_timestamp($1 / 1000.0)',
        [now]
      );
    },
  };
}

function createSessionStore(
  pool: Pool,
  key: Buffer,
  sessionId: string,
  writeState: GitHubAuthSessionWriteState
) {
  const sessionHash = hashOpaqueId(sessionId);
  return {
    get: async (): Promise<AuthSession | null> => {
      const result = await pool.query<{
        readonly encrypted_payload: string;
        readonly expires_at: Date | null;
      }>(
        `SELECT encrypted_payload, expires_at
         FROM atlas_oauth.sessions
         WHERE session_id_hash = $1
           AND status = 'active'`,
        [sessionHash]
      );
      if (result.rowCount === 0) return null;
      const [row] = result.rows;
      if (row.expires_at !== null && row.expires_at.getTime() <= Date.now()) {
        await pool.query('DELETE FROM atlas_oauth.sessions WHERE session_id_hash = $1', [
          sessionHash,
        ]);
        return null;
      }
      return decryptPayload<AuthSession>(row.encrypted_payload, key, sessionAad(sessionHash));
    },
    save: async (session: AuthSession): Promise<void> => {
      await saveSessionAsync(
        pool,
        sessionHash,
        encryptPayload(session, key, sessionAad(sessionHash)),
        session.expiresAt,
        writeState
      );
    },
    clear: async (): Promise<void> => {
      await pool.query('DELETE FROM atlas_oauth.sessions WHERE session_id_hash = $1', [
        sessionHash,
      ]);
    },
  };
}

/*** Write an encrypted session through either a pooled query or the rotation transaction. */
function saveSessionAsync(
  database: Pool | PoolClient,
  sessionHash: string,
  payload: string,
  expiresAt: number | undefined,
  status: GitHubAuthSessionWriteState
): Promise<unknown> {
  return database.query(
    `INSERT INTO atlas_oauth.sessions
      (session_id_hash, encrypted_payload, status, expires_at, encryption_key_version)
     VALUES ($1, $2, $3, CASE WHEN $4::bigint IS NULL THEN NULL ELSE to_timestamp($4 / 1000.0) END, 1)
     ON CONFLICT (session_id_hash) DO UPDATE
       SET encrypted_payload = EXCLUDED.encrypted_payload,
           status = EXCLUDED.status,
           expires_at = EXCLUDED.expires_at,
           encryption_key_version = EXCLUDED.encryption_key_version,
           updated_at = now()`,
    [sessionHash, payload, status, expiresAt ?? null]
  );
}

/*** Reject malformed deployment secrets before any OAuth record can be read or written. */
function readEncryptionKey(value: string): Buffer {
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value)
    throw new Error('ATLAS_OAUTH_ENCRYPTION_KEY must be 32 Base64-encoded bytes.');
  return key;
}

/*** Hash browser-controlled opaque identifiers before durable storage. */
function hashOpaqueId(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/*** Encrypt one JSON payload with independent authenticated encryption material. */
function encryptPayload(value: unknown, key: Buffer, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString('base64')).join('.');
}

/*** Decrypt only an authenticated record bound to its storage role and opaque session identifier. */
function decryptPayload<T>(value: string, key: Buffer, aad: string): T {
  const [ivText, tagText, ciphertextText, ...unexpected] = value.split('.');
  if (unexpected.length > 0) throw new Error('Invalid encrypted OAuth record.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64'));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tagText, 'base64'));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  ) as T;
}

/*** Bind authorization attempts to their record purpose and their originating browser session. */
function authorizationAttemptAad(sessionHash: string): string {
  return `atlas_oauth:authorization_attempt:v1:${sessionHash}`;
}

/*** Bind sessions to their record purpose and their opaque browser identifier. */
function sessionAad(sessionHash: string): string {
  return `atlas_oauth:session:v1:${sessionHash}`;
}

interface PostgresGitHubAuthPersistenceConfiguration {
  readonly databaseUrl: string;
  readonly encryptionKey: string;
  readonly tls?: boolean;
}
