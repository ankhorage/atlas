import { createHash, randomBytes } from 'node:crypto';

import { assert, describe, it } from '@artiphishle/testosterone';
import { Pool } from 'pg';

import { createPostgresGitHubAuthPersistence } from '@/features/github-auth/adapters/outbound/postgres/createPostgresGitHubAuthPersistence';

const databaseUrl = process.env.ATLAS_OAUTH_DATABASE_URL;
const encryptionKey = Buffer.alloc(32, 7).toString('base64');
const testRunId = randomBytes(12).toString('hex');

if (databaseUrl !== undefined) {
  describe('[PostgresGitHubAuthPersistence]', () => {
    it('atomically rotates adapter-created sessions so prior cookies cannot be replayed', async () => {
      const persistence = createPersistence();
      const first = persistence.createSessionStore('browser-a');
      await first.save(session('access-token-a', 'user-a'));
      const database = createDatabasePool();
      const stored = await database.query<{ readonly encrypted_payload: string }>(
        'SELECT encrypted_payload FROM atlas_oauth.sessions'
      );
      assert.equal(stored.rows[0]?.encrypted_payload.includes('access-token-a'), false);
      assert.equal((await first.get())?.accessToken, 'access-token-a');

      await persistence.rotateSessionAsync(
        'browser-a',
        'browser-a-rotated',
        session('access-token-a-rotated', 'user-a')
      );
      const rotated = persistence.createSessionStore('browser-a-rotated');
      assert.equal(await first.get(), null);
      assert.equal((await rotated.get())?.accessToken, 'access-token-a-rotated');
      await persistence.rotateSessionAsync(
        'browser-a',
        'browser-a-rotated',
        session('access-token-a-rotated', 'user-a')
      );
      assert.equal((await rotated.get())?.accessToken, 'access-token-a-rotated');
      await rotated.clear();
      assert.equal(await rotated.get(), null);
      await database.end();
    });

    it('consumes a browser-bound attempt only once under parallel callbacks and rejects replay', async () => {
      const persistence = createPersistence();
      const store = persistence.createAuthorizationAttemptStore('browser-a');
      const attemptId = `attempt-a-${testRunId}`;
      await store.create(attempt(attemptId, Date.now() + 60_000));
      const consumed = await Promise.all(
        Array.from({ length: 8 }, () => store.consume(attemptId, Date.now()))
      );
      assert.equal(consumed.filter(value => value !== null).length, 1);
      assert.equal(await store.consume(attemptId, Date.now()), null);
    });

    it('rejects expired attempts and attempts from a different browser session', async () => {
      const persistence = createPersistence();
      const browserA = persistence.createAuthorizationAttemptStore('browser-a');
      const expiredAttemptId = `expired-${testRunId}`;
      const boundAttemptId = `bound-${testRunId}`;
      await browserA.create(attempt(expiredAttemptId, Date.now() - 1));
      await browserA.create(attempt(boundAttemptId, Date.now() + 60_000));
      assert.equal(await browserA.consume(expiredAttemptId, Date.now()), null);
      assert.equal(
        await persistence
          .createAuthorizationAttemptStore('browser-b')
          .consume(boundAttemptId, Date.now()),
        null
      );
    });

    it('isolates users, survives adapter recreation, and fails closed for invalid ciphertext', async () => {
      const firstProcess = createPersistence();
      await firstProcess.createSessionStore('browser-a').save(session('token-a', 'user-a'));
      await firstProcess.createSessionStore('browser-b').save(session('token-b', 'user-b'));
      const restartedProcess = createPersistence();
      assert.equal(
        (await restartedProcess.createSessionStore('browser-a').get())?.user.id,
        'user-a'
      );
      assert.equal(
        (await restartedProcess.createSessionStore('browser-b').get())?.user.id,
        'user-b'
      );

      const database = createDatabasePool();
      await database.query(
        "UPDATE atlas_oauth.sessions SET encrypted_payload = 'invalid' WHERE session_id_hash = $1",
        [createHash('sha256').update('browser-a').digest('hex')]
      );
      await assert.rejects(() => restartedProcess.createSessionStore('browser-a').get());
      assert.equal(
        (await restartedProcess.createSessionStore('browser-b').get())?.accessToken,
        'token-b'
      );
      await database.end();
    });

    it('rejects a missing encryption key before connecting and reports unavailable databases through the port', async () => {
      assert.throws(() =>
        createPostgresGitHubAuthPersistence({
          databaseUrl: requiredDatabaseUrl(),
          encryptionKey: '',
        })
      );
      const unavailable = createPostgresGitHubAuthPersistence({
        databaseUrl: 'postgresql://127.0.0.1:1/atlas',
        encryptionKey,
      });
      await assert.rejects(() => unavailable.createSessionStore('browser-a').get());
    });
  });
}

/*** Build an adapter against the CI PostgreSQL service with a fixed test-only encryption key. */
function createPersistence() {
  return createPostgresGitHubAuthPersistence({
    databaseUrl: requiredDatabaseUrl(),
    encryptionKey,
    tls: false,
  });
}

/*** Keep test database access explicit and TLS-free only for the ephemeral CI service. */
function createDatabasePool(): Pool {
  return new Pool({ connectionString: requiredDatabaseUrl(), ssl: false });
}

/*** Require the opt-in integration database instead of silently replacing persistence with a mock. */
function requiredDatabaseUrl(): string {
  if (databaseUrl === undefined)
    throw new Error('ATLAS_OAUTH_DATABASE_URL is required for OAuth tests.');
  return databaseUrl;
}

/*** Construct a provider-compatible authorization attempt with a distinct encrypted state. */
function attempt(attemptId: string, expiresAt: number) {
  return {
    attemptId,
    expiresAt,
    redirectUri: 'https://atlas.example/callback',
    state: randomBytes(16).toString('hex'),
  };
}

/*** Construct a minimal AuthSession without ever using a real provider credential in the test database. */
function session(accessToken: string, userId: string) {
  return { accessToken, expiresAt: Date.now() + 60_000, user: { id: userId, username: userId } };
}
