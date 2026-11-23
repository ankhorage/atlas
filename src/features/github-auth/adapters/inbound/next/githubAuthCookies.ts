import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { GitHubAuthorizationAttempt } from '@ankhorage/auth-github';
import type { AuthSession } from '@ankhorage/contracts/auth';
import type { ResponseCookies } from 'next/dist/server/web/spec-extension/cookies';

/*** Keep GitHub credentials encrypted and authenticated in host-only browser cookies. */
const githubAuthCookieNames = {
  attempt: '__Host-atlas-github-attempt',
  privateAccess: '__Host-atlas-github-private-access',
  privateAccessRequest: '__Host-atlas-github-private-access-request',
  returnTo: '__Host-atlas-github-return-to',
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

/*** Retain the safe Atlas destination while GitHub owns the browser navigation. */
export function setGitHubAuthReturnToCookie(returnTo: string, cookies: ResponseCookies): void {
  cookies.set(githubAuthCookieNames.returnTo, sealCookieValue({ returnTo }, 'return-to'), {
    ...cookieOptions(),
    maxAge: 600,
  });
}

/*** Remember a private-scope request only until the authorization callback completes. */
export function setGitHubPrivateAccessRequestCookie(cookies: ResponseCookies): void {
  cookies.set(
    githubAuthCookieNames.privateAccessRequest,
    sealCookieValue({ requested: true }, 'private-access-request'),
    { ...cookieOptions(), maxAge: 600 }
  );
}

/*** Mark a completed private-scope authorization without exposing a credential to the browser. */
export function setGitHubPrivateAccessCookie(cookies: ResponseCookies): void {
  cookies.set(
    githubAuthCookieNames.privateAccess,
    sealCookieValue({ enabled: true }, 'private-access'),
    {
      ...cookieOptions(),
      maxAge: 28_800,
    }
  );
}

/*** Remove transient authorization state after a callback, whether it succeeded or failed. */
export function clearGitHubAuthAttemptCookie(cookies: ResponseCookies): void {
  clearGitHubAuthCookie(githubAuthCookieNames.attempt, cookies);
}

/*** Remove the opaque local browser session without claiming to revoke copied stateless cookies. */
export function clearGitHubAuthSessionCookie(cookies: ResponseCookies): void {
  clearGitHubAuthCookie(githubAuthCookieNames.session, cookies);
}

/*** Clear navigation and private-scope markers whenever the related authorization ends. */
export function clearGitHubAuthReturnToCookie(cookies: ResponseCookies): void {
  clearGitHubAuthCookie(githubAuthCookieNames.returnTo, cookies);
}

/*** Clear the one-time private authorization request after its callback is handled. */
export function clearGitHubPrivateAccessRequestCookie(cookies: ResponseCookies): void {
  clearGitHubAuthCookie(githubAuthCookieNames.privateAccessRequest, cookies);
}

/*** Clear the browser-local marker when the user signs out. */
export function clearGitHubPrivateAccessCookie(cookies: ResponseCookies): void {
  clearGitHubAuthCookie(githubAuthCookieNames.privateAccess, cookies);
}

/*** Emit a host-only HTTPS tombstone that matches the scope of each authentication cookie. */
function clearGitHubAuthCookie(
  name: (typeof githubAuthCookieNames)[keyof typeof githubAuthCookieNames],
  cookies: ResponseCookies
): void {
  cookies.set(name, '', { ...cookieOptions(), expires: new Date(0), maxAge: 0 });
}

/*** Use host-only, HTTPS, HttpOnly, SameSite cookies; no token ever enters browser-readable storage. */
function cookieOptions() {
  return { httpOnly: true, path: '/', sameSite: 'lax' as const, secure: true };
}

/*** Decode a verified session only in a server route or server component. */
export function readGitHubAuthSession(cookieHeader: string | null): AuthSession | undefined {
  const session = readCookie(cookieHeader, githubAuthCookieNames.session);
  const opened =
    session === undefined ? undefined : openCookieValue<AuthSession>(session, 'session');
  return opened === undefined || isExpired(opened.expiresAt) ? undefined : opened;
}

/*** Decode a verified authorization attempt only for the OAuth callback. */
export function readGitHubAuthAttempt(
  cookieHeader: string | null
): GitHubAuthorizationAttempt | undefined {
  const attempt = readCookie(cookieHeader, githubAuthCookieNames.attempt);
  const opened =
    attempt === undefined
      ? undefined
      : openCookieValue<GitHubAuthorizationAttempt>(attempt, 'attempt');
  return opened === undefined || isExpired(opened.expiresAt) ? undefined : opened;
}

/*** Read a callback destination only after authenticating its opaque host cookie. */
export function readGitHubAuthReturnTo(cookieHeader: string | null): string | undefined {
  const value = readCookie(cookieHeader, githubAuthCookieNames.returnTo);
  const opened =
    value === undefined
      ? undefined
      : openCookieValue<{ readonly returnTo?: unknown }>(value, 'return-to');
  return opened !== undefined && isSafeAtlasPath(opened.returnTo) ? opened.returnTo : undefined;
}

/*** Report a successful private-scope authorization marker without treating it as a token. */
export function readGitHubPrivateAccess(cookieHeader: string | null): boolean {
  return readGitHubCookieFlag(
    cookieHeader,
    githubAuthCookieNames.privateAccess,
    'private-access',
    'enabled'
  );
}

/*** Report the in-flight consent request only at the callback boundary. */
export function readGitHubPrivateAccessRequest(cookieHeader: string | null): boolean {
  return readGitHubCookieFlag(
    cookieHeader,
    githubAuthCookieNames.privateAccessRequest,
    'private-access-request',
    'requested'
  );
}

/*** Report whether the deployment has a valid cookie key without exposing or deriving its value. */
export function hasGitHubAuthCookieEncryptionKey(): boolean {
  try {
    readEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

/*** Encrypt and authenticate cookie content with the deployment-owned 256-bit key. */
function sealCookieValue(value: unknown, purpose: CookiePurpose): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', readEncryptionKey(), iv);
  cipher.setAAD(Buffer.from(`atlas-github-auth:${purpose}:v1`));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString('base64url')).join('.');
}

/*** Reject malformed, tampered, or incorrectly purposed cookie values without revealing their content. */
function openCookieValue<T>(value: string, purpose: CookiePurpose): T | undefined {
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

/*** Reject locally expired sealed values even if a browser or attacker retains their cookie. */
function isExpired(expiresAt: number | undefined): boolean {
  return expiresAt === undefined || !Number.isFinite(expiresAt) || expiresAt <= Date.now();
}

/*** Read only an exact host-owned cookie name. */
function readCookie(cookieHeader: string | null, name: string): string | undefined {
  return cookieHeader?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`, 'u'))?.[1];
}

/*** Keep OAuth redirects inside this app even if a cookie was copied or tampered with. */
function isSafeAtlasPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
}

/*** Decode a short-lived boolean marker without widening cookie parsing to callers. */
function readGitHubCookieFlag(
  cookieHeader: string | null,
  name: string,
  purpose: CookiePurpose,
  property: 'enabled' | 'requested'
): boolean {
  const value = readCookie(cookieHeader, name);
  const opened =
    value === undefined ? undefined : openCookieValue<Record<string, unknown>>(value, purpose);
  return property === 'enabled' ? opened?.enabled === true : opened?.requested === true;
}

type CookiePurpose =
  'attempt' | 'private-access' | 'private-access-request' | 'return-to' | 'session';
