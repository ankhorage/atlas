import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { chromium, type BrowserContext, type Page } from 'playwright-core';

import { createGitHubLogoutRoute } from '@/features/github-auth/adapters/inbound/next/createGitHubLogoutRoute';
import {
  readGitHubAuthSession,
  setGitHubAuthAttemptCookie,
  setGitHubAuthSessionCookie,
} from '@/features/github-auth/adapters/inbound/next/githubAuthCookies';
import { NextResponse } from 'next/server';

const browserPath = process.env.ATLAS_CHROME;

if (browserPath === undefined)
  throw new Error('ATLAS_CHROME must point to an installed Chrome or Chromium binary.');

process.env.ATLAS_GITHUB_OAUTH_COOKIE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

const temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'atlas-github-logout-browser-'));
const certificate = await createCertificateAsync(temporaryDirectory);
const serverState = { adapterCalls: 0 };
const server = createLogoutAcceptanceServer(certificate, serverState);
const port = await listenAsync(server);
const origin = `https://localhost:${port}`;
const attackerOrigin = `https://127.0.0.1:${port}`;
const browser = await chromium.launch({ executablePath: browserPath, headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true });

try {
  await assertSuccessfulLogoutAsync(context, origin);
  await assertLocalLogoutOnAdapterFailureAsync(context, origin, 'false');
  await assertLocalLogoutOnAdapterFailureAsync(context, origin, 'throw');
  await assertCrossOriginLogoutHasNoMutationAsync(context, origin, attackerOrigin, serverState);
  await assertReloginAsync(context, origin);
} finally {
  await context.close();
  await browser.close();
  await closeAsync(server);
  await rm(temporaryDirectory, { force: true, recursive: true });
}

/*** Prove a successful HTTPS logout returns 303, clears host cookies, and leaves protected requests anonymous. */
async function assertSuccessfulLogoutAsync(context: BrowserContext, origin: string): Promise<void> {
  const page = await loginAsync(context, origin);
  await submitLogoutAsync(page, origin, 'success');
  await assertAnonymousAsync(page, origin);
  await assertNoAuthCookiesAsync(context, origin);
  await page.close();
}

/*** Prove local browser logout survives an unavailable or throwing provider adapter. */
async function assertLocalLogoutOnAdapterFailureAsync(
  context: BrowserContext,
  origin: string,
  mode: 'false' | 'throw'
): Promise<void> {
  const page = await loginAsync(context, origin);
  await submitLogoutAsync(page, origin, mode);
  await assertAnonymousAsync(page, origin);
  await assertNoAuthCookiesAsync(context, origin);
  await page.close();
}

/*** Prove a different HTTPS origin receives 403 without invoking cleanup or mutating the local cookie jar. */
async function assertCrossOriginLogoutHasNoMutationAsync(
  context: BrowserContext,
  origin: string,
  attackerOrigin: string,
  serverState: { adapterCalls: number }
): Promise<void> {
  const authenticated = await loginAsync(context, origin);
  const callsBefore = serverState.adapterCalls;
  const attacker = await context.newPage();
  await attacker.goto(`${attackerOrigin}/attacker`, { waitUntil: 'networkidle' });
  const response = await Promise.all([
    attacker.waitForResponse(
      value => value.url().startsWith(`${origin}/logout`) && value.status() === 403
    ),
    attacker.locator('button').click(),
  ]);
  if (response[0].status() !== 403) throw new Error('Cross-origin logout did not return 403.');
  if (serverState.adapterCalls !== callsBefore)
    throw new Error('Cross-origin logout invoked the provider cleanup adapter.');
  await assertAuthenticatedAsync(authenticated, origin);
  await attacker.close();
  await authenticated.close();
}

/*** Prove an explicit login can establish a fresh encrypted browser session after logout. */
async function assertReloginAsync(context: BrowserContext, origin: string): Promise<void> {
  const page = await loginAsync(context, origin);
  await assertAuthenticatedAsync(page, origin);
  await page.close();
}

/*** Establish a real HTTPS Chromium cookie jar through the same cookie writer used by the app route. */
async function loginAsync(context: BrowserContext, origin: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${origin}/login`, { waitUntil: 'networkidle' });
  await assertAuthenticatedAsync(page, origin);
  return page;
}

/*** Submit a real same-origin browser form and retain the 303 response as acceptance evidence. */
async function submitLogoutAsync(
  page: Page,
  origin: string,
  mode: 'success' | 'false' | 'throw'
): Promise<void> {
  await page.goto(`${origin}/?mode=${mode}`, { waitUntil: 'networkidle' });
  const [response] = await Promise.all([
    page.waitForResponse(
      value => value.url().startsWith(`${origin}/logout`) && value.status() === 303
    ),
    page.getByRole('button', { name: 'Log out' }).click(),
  ]);
  if (response.status() !== 303)
    throw new Error(`Logout returned ${response.status()} instead of 303.`);
  await page.waitForURL(`${origin}/`);
}

/*** Assert the protected server boundary cannot read an encrypted GitHub session after logout. */
async function assertAnonymousAsync(page: Page, origin: string): Promise<void> {
  await page.goto(`${origin}/protected`, { waitUntil: 'networkidle' });
  if ((await page.locator('body').innerText()) !== 'anonymous')
    throw new Error('Protected operation retained an authenticated browser session after logout.');
}

/*** Assert the protected server boundary can read the freshly issued encrypted GitHub session. */
async function assertAuthenticatedAsync(page: Page, origin: string): Promise<void> {
  await page.goto(`${origin}/protected`, { waitUntil: 'networkidle' });
  if ((await page.locator('body').innerText()) !== 'authenticated')
    throw new Error(
      'Protected operation did not receive the expected authenticated browser session.'
    );
}

/*** Assert Chromium removed both host-only authentication cookies rather than merely hiding a response header. */
async function assertNoAuthCookiesAsync(context: BrowserContext, origin: string): Promise<void> {
  const cookies = await context.cookies(origin);
  const names = cookies.map(cookie => cookie.name);
  if (
    names.includes('__Host-atlas-github-session') ||
    names.includes('__Host-atlas-github-attempt')
  )
    throw new Error(`Chromium retained GitHub auth cookies after logout: ${names.join(', ')}`);
}

/*** Host the route factory behind a minimal HTTPS transport without substituting its Next.js cookie implementation. */
function createLogoutAcceptanceServer(
  certificate: { readonly cert: Buffer; readonly key: Buffer },
  serverState: { adapterCalls: number }
): Server {
  return createServer(certificate, async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', `https://${request.headers.host}`);
    if (requestUrl.pathname === '/login') return writeLoginResponse(response);
    if (requestUrl.pathname === '/protected')
      return writeTextResponse(
        response,
        readGitHubAuthSession(request.headers.cookie ?? null) === undefined
          ? 'anonymous'
          : 'authenticated'
      );
    if (requestUrl.pathname === '/attacker')
      return writeAttackerResponse(response, requestUrl.port);
    if (requestUrl.pathname === '/logout')
      return writeRouteResponseAsync(response, request, requestUrl, serverState);
    return writeHtmlResponse(
      response,
      logoutForm(requestUrl.searchParams.get('mode') ?? 'success')
    );
  });
}

/*** Issue the real host-only encrypted cookies used by the production GitHub login callback. */
function writeLoginResponse(response: ServerResponse): void {
  const next = NextResponse.next();
  setGitHubAuthAttemptCookie(
    {
      attemptId: 'attempt-a',
      expiresAt: Date.now() + 60_000,
      redirectUri: 'https://localhost/api/auth/github/callback',
      state: 'state-a',
    },
    next.cookies
  );
  setGitHubAuthSessionCookie(
    {
      accessToken: 'test-token',
      expiresAt: Date.now() + 60_000,
      user: { id: 'user-a', username: 'user-a' },
    },
    next.cookies
  );
  writeHeaders(response, next.headers, 200);
  response.end('logged in');
}

/*** Translate a Node HTTPS request into the route's real Next.js ResponseCookies boundary. */
async function writeRouteResponseAsync(
  response: ServerResponse,
  request: IncomingMessage,
  requestUrl: URL,
  serverState: { adapterCalls: number }
): Promise<void> {
  const logout = createGitHubLogoutRoute(async () => {
    serverState.adapterCalls += 1;
    if (requestUrl.searchParams.get('mode') === 'throw') throw new Error('adapter unavailable');
    return requestUrl.searchParams.get('mode') !== 'false';
  });
  const routeResponse = await logout(
    new Request(requestUrl, { headers: request.headers as HeadersInit, method: request.method })
  );
  writeHeaders(response, routeResponse.headers, routeResponse.status);
  response.end(Buffer.from(await routeResponse.arrayBuffer()));
}

/*** Render a same-origin form whose native browser submission tests the 303 logout response. */
function logoutForm(mode: string): string {
  return `<form action="/logout?mode=${encodeURIComponent(mode)}" method="post"><button>Log out</button></form>`;
}

/*** Render an attacker page that submits a native cross-origin POST without synthetic request headers. */
function writeAttackerResponse(response: ServerResponse, port: string): void {
  writeHtmlResponse(
    response,
    `<form action="https://localhost:${port}/logout?mode=success" method="post"><button>Attack</button></form>`
  );
}

/*** Send a small HTML response for the browser-driven HTTPS acceptance harness. */
function writeHtmlResponse(response: ServerResponse, body: string): void {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(body);
}

/*** Send plain text from the protected route while retaining the HTTPS transport boundary. */
function writeTextResponse(response: ServerResponse, body: string): void {
  response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(body);
}

/*** Preserve all Next response headers, including distinct Set-Cookie headers, in Node HTTPS transport. */
function writeHeaders(response: ServerResponse, headers: Headers, status: number): void {
  const responseHeaders = Object.fromEntries(headers.entries());
  const setCookies = headers.getSetCookie();
  delete responseHeaders['set-cookie'];
  if (setCookies.length > 0) response.setHeader('set-cookie', setCookies);
  response.writeHead(status, responseHeaders);
}

/*** Create a short-lived localhost certificate only for this isolated HTTPS acceptance server. */
async function createCertificateAsync(
  directory: string
): Promise<{ readonly cert: Buffer; readonly key: Buffer }> {
  const keyPath = resolve(directory, 'localhost.key');
  const certPath = resolve(directory, 'localhost.crt');
  const process = Bun.spawn([
    'openssl',
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=DNS:localhost',
  ]);
  if ((await process.exited) !== 0)
    throw new Error('openssl could not create the HTTPS test certificate.');
  return { cert: await readFile(certPath), key: await readFile(keyPath) };
}

/*** Bind the acceptance server on an ephemeral port so concurrent test runs cannot collide. */
function listenAsync(server: Server): Promise<number> {
  return new Promise((resolvePort, reject) => {
    server.once('error', reject);
    server.listen(0, () => {
      server.off('error', reject);
      const address = server.address();
      if (address === null || typeof address === 'string')
        return reject(new Error('No TCP address.'));
      resolvePort(address.port);
    });
  });
}

/*** Close the ephemeral HTTPS server after Chromium has released all connections. */
function closeAsync(server: Server): Promise<void> {
  return new Promise((resolveClose, reject) =>
    server.close(error => (error === undefined ? resolveClose() : reject(error)))
  );
}
