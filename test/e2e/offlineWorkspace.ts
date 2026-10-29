import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium, type Page } from 'playwright-core';

const reportPath = resolve(process.env.ATLAS_OFFLINE_REPORT ?? 'offline-smoke.html');
const browserPath = process.env.ATLAS_CHROME;

if (browserPath === undefined)
  throw new Error('ATLAS_CHROME must point to an installed Chrome or Chromium binary.');

const temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'atlas-offline-browser-'));
const copiedReportPath = resolve(temporaryDirectory, basename(reportPath));
await cp(reportPath, copiedReportPath);

const context = await chromium.launchPersistentContext(resolve(temporaryDirectory, 'profile'), {
  executablePath: browserPath,
  headless: true,
});

try {
  const offline = await context.newPage();
  const networkAttempts = observeOfflineRuntime(offline);
  await offline.goto(pathToFileURL(copiedReportPath).href, { waitUntil: 'networkidle' });
  await assertWorkspace(offline, networkAttempts);
  await assertUnavailableOfflineActions(offline);
  if (networkAttempts.length > 0)
    throw new Error(`Unexpected offline network attempts: ${networkAttempts.join(', ')}`);

  await assertInvalidSnapshot(context, copiedReportPath);

  if (process.env.ATLAS_ONLINE_URL !== undefined) {
    const online = await context.newPage();
    await online.goto(process.env.ATLAS_ONLINE_URL, { waitUntil: 'networkidle' });
    await assertWorkspace(online, []);
    await assertParity(offline, online);
  }
} finally {
  await context.close();
  await rm(temporaryDirectory, { force: true, recursive: true });
}

function observeOfflineRuntime(page: Page): string[] {
  const attempts: string[] = [];
  page.on('request', request => {
    if (!request.url().startsWith('file:'))
      attempts.push(`${request.resourceType()}:${request.url()}`);
  });
  page.on('websocket', socket => attempts.push(`websocket:${socket.url()}`));
  page.on('pageerror', error => attempts.push(`runtime-error:${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') attempts.push(`runtime-error:${message.text()}`);
  });
  return attempts;
}

async function assertWorkspace(page: Page, runtimeAttempts: readonly string[]): Promise<void> {
  const error = page.getByRole('alert', { name: 'Unable to load project' });
  if ((await error.count()) > 0)
    throw new Error(`Workspace failed to start: ${await error.innerText()}`);
  await page
    .getByText('my-app', { exact: true })
    .waitFor({ timeout: 5000 })
    .catch(async () => {
      throw new Error(
        `Workspace header did not render: ${await page.locator('body').innerText()} ${runtimeAttempts.join(' | ')}`
      );
    });
  await page.getByRole('application', { name: 'Graph' }).waitFor();
  await page.getByRole('tree', { name: 'Project tree' }).waitFor();

  const zoom = page.getByLabel('Zoom');
  const initialZoom = await zoom.inputValue();
  await zoom.focus();
  await page.keyboard.press('ArrowRight');
  if ((await zoom.inputValue()) === initialZoom)
    throw new Error('Graph zoom did not respond to a real keyboard interaction.');

  await page.getByLabel('Expand').first().click();
  await page.getByLabel('Collapse').first().click();

  await selectGraphNodes(page);

  const ruleTab = page.getByRole('tab', { name: /Rules/ });
  await ruleTab.click();
  await page
    .getByText(/cyclic/i)
    .waitFor({ timeout: 5000 })
    .catch(async () => {
      throw new Error(`Audit rule panel did not render: ${await page.locator('body').innerText()}`);
    });
  await page.getByRole('button', { name: /Dark|Light/ }).click();
}

async function selectGraphNodes(page: Page): Promise<void> {
  const graph = page.getByRole('application', { name: 'Graph' });
  const canvas = graph.locator('canvas').first();
  await canvas.waitFor();
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('Graph canvas is not visible.');

  const positions = [0.15, 0.35, 0.5, 0.65, 0.85].flatMap(x =>
    [0.2, 0.5, 0.8].map(y => ({ x: box.width * x, y: box.height * y }))
  );
  const selectedTreeItems = page.getByRole('treeitem', { selected: true });

  const firstSelectionIndex = await findSelectionIndex(
    positions,
    position => canvas.click({ position }),
    selectedTreeItems
  );
  if (firstSelectionIndex === -1) {
    throw new Error('A real graph-node click did not synchronize selection to the project tree.');
  }

  const nextPositions = positions.filter((_, index) => index !== firstSelectionIndex);
  const secondSelectionIndex = await findSelectionIndex(
    nextPositions,
    position =>
      canvas.click({
        modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'],
        position,
      }),
    selectedTreeItems,
    2
  );
  if (secondSelectionIndex === -1) {
    throw new Error('A modified graph-node click did not create a synchronized multi-selection.');
  }
}

async function findSelectionIndex(
  positions: readonly { readonly x: number; readonly y: number }[],
  click: (position: { readonly x: number; readonly y: number }) => Promise<void>,
  selectedTreeItems: ReturnType<Page['getByRole']>,
  minimumSelectionCount = 1
): Promise<number> {
  for (const [index, position] of positions.entries()) {
    await click(position);
    if ((await selectedTreeItems.count()) >= minimumSelectionCount) return index;
  }
  return -1;
}

async function assertUnavailableOfflineActions(page: Page): Promise<void> {
  if ((await page.getByRole('button', { name: /Export|JSON|XML/i }).count()) > 0) {
    throw new Error('Offline workspace exposed a live export action.');
  }
  if ((await page.getByPlaceholder(/GitHub repository URL/i).count()) > 0) {
    throw new Error('Offline workspace exposed the live source selector.');
  }
}

async function assertInvalidSnapshot(
  context: Awaited<ReturnType<typeof chromium.launchPersistentContext>>,
  sourcePath: string
): Promise<void> {
  const invalidPath = resolve(tmpdir(), `atlas-invalid-${Date.now()}.html`);
  const html = await readFile(sourcePath, 'utf8');
  await writeFile(invalidPath, html.replace('"version":1', '"version":2'));
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(invalidPath).href, { waitUntil: 'networkidle' });
    await page
      .getByRole('alert')
      .getByText('Unsupported Atlas workspace snapshot version: 2.')
      .waitFor();
    await page.close();
  } finally {
    await rm(invalidPath, { force: true });
  }
}

async function assertParity(offline: Page, online: Page): Promise<void> {
  if (
    (await offline.getByRole('treeitem').count()) !== (await online.getByRole('treeitem').count())
  ) {
    throw new Error('Online/offline project-tree parity mismatch.');
  }
}
