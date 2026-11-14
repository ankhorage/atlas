import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { GitHubAuthorizationAttempt } from '@ankhorage/auth-github';
import type { AuthSession } from '@ankhorage/contracts/auth';
import type { ResponseCookies } from 'next/dist/server/web/spec-extension/cookies';

/*** Keep GitHub credentials encrypted and authenticated in host-only browser cookies. */
const githubAuthCookieNames = {
  attempt: '__Host-atlas-github-attempt',
  session: '__Host-atlas-github-session',
} as const;

/*** Store a short-lived OAuth attempt so the callback state is bound to the initiating browser. */
export function setGitHubAuthAttemptCookie(
  attempt: GitHubAuthorizationAttempt,
  cookies: ResponseCookies
): void {
  cookies.set(githubAuthCookieNames.attempt, sealCookieValue(attempt, 'attempt'), {
    ...cookieOptions(),
    maxAge: Math.max(1, Math.ceil((attempt.expiresAt - Date.now()) / 1_000)),
  });
}

/*** Store a locally bounded GitHub session; provider tokens never appear in readable browser storage. */
export function setGitHubAuthSessionCookie(session: AuthSession, cookies: ResponseCookies): void {
  const expiresAt = Math.min(session.expiresAt ?? Number.MAX_SAFE_INTEGER, Date.now() + 28_800_000);
  const boundedSession = { ...session, expiresAt };
  cookies.set(githubAuthCookieNames.session, sealCookieValue(boundedSession, 'session'), {
    ...cookieOptions(),
    maxAge: Math.max(1, Math.ceil((expiresAt - Date.now()) / 1_000)),
  });
}

/*** Remove transient authorization state after a callback, whether it succeeded or failed. */
export function clearGitHubAuthAttemptCookie(cookies: ResponseCookies): void {
  cookies.delete(githubAuthCookieNames.attempt);
}

/*** Remove the opaque local session after the adapter revokes its stored credentials. */
export function clearGitHubAuthSessionCookie(cookies: ResponseCookies): void {
  cookies.delete(githubAuthCookieNames.session);
}

/*** Use host-only, HTTPS, HttpOnly, SameSite cookies; no token ever enters browser-readable storage. */
function cookieOptions() {
  return { httpOnly: true, path: '/', sameSite: 'lax' as const, secure: true };
}

/*** Decode a verified session only in a server route or server component. */
export function readGitHubAuthSession(cookieHeader: string | null): AuthSession | undefined {
  const session = readCookie(cookieHeader, githubAuthCookieNames.session);
  return session === undefined ? undefined : openCookieValue<AuthSession>(session, 'session');
}

/*** Decode a verified authorization attempt only for the OAuth callback. */
export function readGitHubAuthAttempt(
  cookieHeader: string | null
): GitHubAuthorizationAttempt | undefined {
  const attempt = readCookie(cookieHeader, githubAuthCookieNames.attempt);
  return attempt === undefined
    ? undefined
    : openCookieValue<GitHubAuthorizationAttempt>(attempt, 'attempt');
}

/*** Encrypt and authenticate cookie content with the deployment-owned 256-bit key. */
function sealCookieValue(value: unknown, purpose: 'attempt' | 'session'): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', readEncryptionKey(), iv);
  cipher.setAAD(Buffer.from(`atlas-github-auth:${purpose}:v1`));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString('base64url')).join('.');
}

/*** Reject malformed, tampered, or incorrectly purposed cookie values without revealing their content. */
function openCookieValue<T>(value: string, purpose: 'attempt' | 'session'): T | undefined {
  try {
    const [iv, tag, ciphertext, ...unexpected] = value.split('.');
    if (unexpected.length > 0) return undefined;
    const decipher = createDecipheriv(
      'aes-256-gcm',
      readEncryptionKey(),
      Buffer.from(iv, 'base64url')
    );
    decipher.setAAD(Buffer.from(`atlas-github-auth:${purpose}:v1`));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8')
    ) as T;
  } catch {
    return undefined;
  }
}

/*** Require a stable, server-only encryption key rather than falling back to plaintext or process memory. */
function readEncryptionKey(): Buffer {
  const value = process.env.ATLAS_GITHUB_OAUTH_COOKIE_ENCRYPTION_KEY;
  const key = value === undefined ? Buffer.alloc(0) : Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value)
    throw new Error('ATLAS_GITHUB_OAUTH_COOKIE_ENCRYPTION_KEY must be 32 Base64-encoded bytes.');
  return key;
}

/*** Read only an exact host-owned cookie name. */
function readCookie(cookieHeader: string | null, name: string): string | undefined {
  return cookieHeader?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`, 'u'))?.[1];
}
