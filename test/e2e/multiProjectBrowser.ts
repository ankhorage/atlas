import { mkdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

import { chromium, type Browser, type Page } from 'playwright-core';

const browserPath = process.env.ATLAS_CHROME;
if (browserPath === undefined) throw new Error('Missing ENV: ATLAS_CHROME');

const port = 4400 + Math.floor(Math.random() * 400);
const url = `http://127.0.0.1:${port}`;
const evidenceDirectory = resolve('artifacts/browser-acceptance');
const fixtureApplication = resolve('test/e2e/next-fixture-app');
const command = process.platform === 'win32' ? 'bunx.cmd' : 'bunx';

await mkdir(evidenceDirectory, { recursive: true });
const startedAt = performance.now();
const server = spawn(command, ['next', 'start', fixtureApplication, '--port', String(port)], {
  cwd: process.cwd(),
  stdio: 'pipe',
});
const serverOutput: string[] = [];
server.stdout.on('data', chunk => serverOutput.push(String(chunk)));
server.stderr.on('data', chunk => serverOutput.push(String(chunk)));

let browser: Browser | undefined;
try {
  await waitForServerAsync(url);
  browser = await chromium.launch({ executablePath: browserPath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const diagnostics = collectDiagnostics(page);
  await assertMultiProjectVerticalSliceAsync(page, diagnostics);
  await writeFile(
    resolve(evidenceDirectory, 'multi-project-results.json'),
    JSON.stringify(
      {
        durationMilliseconds: Math.round(performance.now() - startedAt),
        fixture: 'workspace-multi',
        ...diagnostics,
      },
      null,
      2
    )
  );
} catch (error) {
  await writeFile(
    resolve(evidenceDirectory, 'multi-project-failure.txt'),
    `${String(error)}\n${serverOutput.join('')}`
  );
  throw error;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await rm(resolve(fixtureApplication, 'build'), { force: true, recursive: true });
}

/*** Exercises the actual Atlas page through the production workspace controls and published ZORA views. */
async function assertMultiProjectVerticalSliceAsync(page: Page, diagnostics: BrowserDiagnostics) {
  await page.goto(`${url}/?source=owner-a%2Cowner-b`, { waitUntil: 'networkidle' });
  await page.getByRole('application', { name: 'Graph' }).waitFor();
  await page.getByText('owner-a', { exact: true }).waitFor();
  await page.getByText('owner-b', { exact: true }).waitFor();
  await page.getByLabel('Choose repositories').click();
  await page.getByLabel('Search repositories').fill('catalog');
  await page.getByText('owner-a/catalog', { exact: true }).waitFor();
  await page.screenshot({
    path: resolve(evidenceDirectory, 'multi-project-canvas.png'),
    fullPage: true,
  });
  if (diagnostics.consoleErrors.length > 0)
    throw new Error(`Browser console errors: ${diagnostics.consoleErrors.join('; ')}`);
  if (diagnostics.outboundRequests.length > 0)
    throw new Error(`Unexpected outbound requests: ${diagnostics.outboundRequests.join(', ')}`);
}

/*** Records browser failure evidence while rejecting requests that leave the local fixture application. */
function collectDiagnostics(page: Page): BrowserDiagnostics {
  const diagnostics: BrowserDiagnostics = {
    consoleErrors: [],
    failedRequests: [],
    outboundRequests: [],
  };
  page.on('console', message => {
    if (
      message.type() === 'error' &&
      !message.text().includes('Failed to load resource: the server responded with a status of 404')
    )
      diagnostics.consoleErrors.push(message.text());
  });
  page.on('pageerror', error => diagnostics.consoleErrors.push(error.message));
  page.on('requestfailed', request =>
    diagnostics.failedRequests.push(`${request.method()} ${request.url()}`)
  );
  page.on('request', request => {
    if (!request.url().startsWith(url))
      diagnostics.outboundRequests.push(`${request.method()} ${request.url()}`);
  });
  return diagnostics;
}

/*** Waits for the isolated production build to accept requests without arbitrary browser sleeps. */
async function waitForServerAsync(serverUrl: string): Promise<void> {
  for (const _attempt of Array.from({ length: 80 })) {
    try {
      const response = await fetch(serverUrl);
      if (response.ok) return;
    } catch {
      // The process has not bound its isolated port yet.
    }
    await Bun.sleep(100);
  }
  throw new Error(`Fixture server did not start at ${serverUrl}.`);
}

interface BrowserDiagnostics {
  readonly consoleErrors: string[];
  readonly failedRequests: string[];
  readonly outboundRequests: string[];
}
