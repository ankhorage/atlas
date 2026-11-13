import { randomUUID } from 'node:crypto';

import type { ResponseCookies } from 'next/dist/server/web/spec-extension/cookies';

/*** Keep browser cookies opaque: OAuth credentials remain exclusively in the host persistence adapter. */
export const githubAuthCookieNames = {
  attempt: '__Host-atlas-github-attempt',
  session: '__Host-atlas-github-session',
} as const;

/*** Issue one opaque server-session identifier with production-safe browser attributes. */
export function ensureGitHubAuthSessionId(
  sessionId: string | undefined,
  cookies: ResponseCookies
): string {
  if (sessionId !== undefined && sessionId !== '') return sessionId;
  const nextSessionId = randomUUID();
  cookies.set(githubAuthCookieNames.session, nextSessionId, cookieOptions());
  return nextSessionId;
}

/*** Bind the one-time OAuth attempt to the browser session without exposing provider state in URLs. */
export function setGitHubAuthAttemptCookie(attemptId: string, cookies: ResponseCookies): void {
  cookies.set(githubAuthCookieNames.attempt, attemptId, { ...cookieOptions(), maxAge: 600 });
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
