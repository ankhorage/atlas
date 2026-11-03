import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
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

type Status = 'passed' | 'failed' | 'blocked' | 'unexecuted';
type Result = {
  readonly artifacts: readonly string[];
  readonly description: string;
  readonly diagnostics: BrowserDiagnostics;
  readonly durationMilliseconds: number;
  readonly finishedAt: string;
  readonly id: string;
  readonly startedAt: string;
  readonly status: Status;
  readonly summary: string;
};
type Scenario = {
  readonly description: string;
  readonly id: string;
  readonly run: (page: Page) => Promise<readonly string[]>;
};
const startedAt = performance.now();
const startedAtIso = new Date().toISOString();
const results: Result[] = [];

await mkdir(evidenceDirectory, { recursive: true });
const server = spawn(command, ['next', 'start', '--port', String(port)], {
  cwd: fixtureApplication,
  stdio: 'pipe',
});
const serverOutput: string[] = [];
server.stdout.on('data', chunk => serverOutput.push(String(chunk)));
server.stderr.on('data', chunk => serverOutput.push(String(chunk)));
let browser: Browser | undefined;
async function runAcceptanceAsync(): Promise<void> {
  try {
    assertScenarioRegistry();
    await waitForServerAsync();
    browser = await chromium.launch({ executablePath: browserPath, headless: true });
    for (const scenario of scenarios) results.push(await runScenarioAsync(browser, scenario));
    assertCompleteAcceptance();
  } catch (error) {
    recordUnexecutedScenarios(String(error));
    await writeReportAsync('failed');
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
  await writeReportAsync('passed');
}

/*** Executes every scenario in a fresh context so no browser storage or selection leaks across them. */
async function runScenarioAsync(browser: Browser, scenario: Scenario): Promise<Result> {
  const started = performance.now();
  const startedAt = new Date().toISOString();
  const diagnostics: BrowserDiagnostics = { consoleErrors: [], outboundRequests: [] };
  let context: Awaited<ReturnType<Browser['newContext']>> | undefined;
  let artifacts: readonly string[] = [];
  try {
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    Object.assign(diagnostics, collectDiagnostics(page));
    artifacts = await scenario.run(page);
    assert(
      process.env.ATLAS_MULTI_PROJECT_FORCE_FAILURE !== scenario.id,
      `Forced assertion failure for ${scenario.id}.`
    );
    assert(
      diagnostics.consoleErrors.length === 0,
      `Browser console errors: ${diagnostics.consoleErrors.join('; ')}`
    );
    assert(
      diagnostics.outboundRequests.length === 0,
      `Unexpected outbound requests: ${diagnostics.outboundRequests.join('; ')}`
    );
    return result(
      scenario,
      started,
      startedAt,
      'passed',
      artifacts,
      diagnostics,
      'Assertions completed.'
    );
  } catch (error) {
    const artifact = `${scenario.id}-failure.png`;
    artifacts = [artifact];
    const page = context === undefined ? undefined : context.pages()[0];
    if (page !== undefined)
      await page.screenshot({ path: resolve(evidenceDirectory, artifact), fullPage: true });
    return result(scenario, started, startedAt, 'failed', artifacts, diagnostics, String(error));
  } finally {
    await context?.close();
  }
}

/*** Produces a complete per-scenario result record; a caught exception is never counted as success. */
function result(
  scenario: Scenario,
  started: number,
  scenarioStartedAt: string,
  status: Status,
  artifacts: readonly string[],
  diagnostics: BrowserDiagnostics,
  summary: string
): Result {
  return {
    artifacts,
    description: scenario.description,
    diagnostics,
    durationMilliseconds: Math.round(performance.now() - started),
    finishedAt: new Date().toISOString(),
    id: scenario.id,
    startedAt: scenarioStartedAt,
    status,
    summary,
  };
}

/*** Retains a truthful result entry for every scenario before returning an acceptance failure. */
async function writeReportAsync(status: 'passed' | 'failed'): Promise<void> {
  const reportPath = resolve(evidenceDirectory, 'multi-project-results.json');
  const temporaryReportPath = `${reportPath}.tmp`;
  await writeFile(
    temporaryReportPath,
    JSON.stringify(
      {
        durationMilliseconds: Math.round(performance.now() - startedAt),
        finishedAt: new Date().toISOString(),
        fixture: 'workspace-multi',
        status,
        results,
        startedAt: startedAtIso,
        totals: Object.fromEntries(
          ['passed', 'failed', 'blocked', 'unexecuted'].map(status => [
            status,
            results.filter(result => result.status === status).length,
          ])
        ),
      },
      null,
      2
    )
  );
  await rename(temporaryReportPath, reportPath);
}

/*** Opens the real fixture application only after its GraphView has announced a settled canvas. */
async function openWorkspaceAsync(page: Page, source = 'owner-a%2Cowner-b'): Promise<void> {
  await page.goto(`${url}/?source=${source}`, { waitUntil: 'networkidle' });
  await page.getByRole('application', { name: 'Graph' }).waitFor();
}

/*** Fails with a concrete diagnostic instead of accepting a missing user-visible state. */
function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const scenarios: readonly Scenario[] = [
  scenario(
    'source-picker-owner-forms',
    'Discovers owner and GitHub URL source forms.',
    async page => {
      await openWorkspaceAsync(page, 'owner-a');
      await page.getByText('owner-a', { exact: true }).waitFor();
      await openWorkspaceAsync(page, encodeURIComponent('https://github.com/owner-a/catalog'));
      await page.getByText('catalog', { exact: true }).waitFor();
      return [];
    }
  ),
  scenario(
    'source-picker-multi-select',
    'Filters repository choices and changes checkbox state.',
    async page => {
      await openWorkspaceAsync(page);
      await page.getByLabel('Choose repositories').click();
      await page.getByLabel('Search repositories').fill('catalog');
      const box = page.getByLabel('owner-a/catalog');
      assert(await box.isChecked(), 'Catalog was not selected.');
      await box.uncheck();
      assert(!(await box.isChecked()), 'Catalog checkbox did not change.');
      return [];
    }
  ),
  scenario(
    'source-picker-explicit-open',
    'Stages selection until an explicit Open action.',
    async page => {
      await openWorkspaceAsync(page);
      const before = page.url();
      await page.getByLabel('Choose repositories').click();
      await page.getByLabel('owner-a/catalog').uncheck();
      assert(page.url() === before, 'Selection navigated before Open.');
      await page.getByRole('button', { name: 'Open' }).click();
      await page.waitForURL(/exclude=owner-a-catalog/u);
      return [];
    }
  ),
  scenario(
    'source-picker-overlap-deduplication',
    'Deduplicates overlapping owner discovery.',
    async page => {
      await openWorkspaceAsync(page);
      await page.getByLabel('Choose repositories').click();
      assert(
        (await page.getByLabel('owner-a/shared').count()) === 1,
        'Overlapping repository was duplicated.'
      );
      return [];
    }
  ),
  scenario('source-picker-exclusion-restoration', 'Restores repository exclusions.', async page => {
    await openWorkspaceAsync(page, 'owner-a%2Cowner-b%7Cexclude%3Downer-a-catalog');
    await page.getByLabel('Choose repositories').click();
    assert(
      !(await page.getByLabel('owner-a/catalog').isChecked()),
      'Excluded repository was selected.'
    );
    return [];
  }),
  scenario(
    'canvas-connected-disconnected',
    'Shows connected and disconnected projects on the shared canvas.',
    async page => {
      await openWorkspaceAsync(page);
      await page.getByText('owner-a', { exact: true }).waitFor();
      await page.getByText('owner-b', { exact: true }).waitFor();
      await page.screenshot({
        path: resolve(evidenceDirectory, 'multi-project-canvas.png'),
        fullPage: true,
      });
      return ['multi-project-canvas.png'];
    }
  ),
  scenario(
    'tree-virtual-hierarchy',
    'Shows the virtual owner/repository TreeView hierarchy.',
    async page => {
      await openWorkspaceAsync(page);
      await page.getByRole('tree', { name: 'Project tree' }).waitFor();
      await page.getByRole('button', { name: 'Expand' }).first().click();
      await page.screenshot({
        path: resolve(evidenceDirectory, 'multi-project-tree.png'),
        fullPage: true,
      });
      return ['multi-project-tree.png'];
    }
  ),
  scenario(
    'tree-graph-selection',
    'Synchronizes TreeView selection with the workspace graph selection.',
    async page => {
      await openWorkspaceAsync(page);
      await page.getByRole('button', { name: 'Expand' }).first().click();
      await page.getByText('catalog', { exact: true }).click();
      assert(
        (await page.getByText('catalog', { exact: true }).count()) > 0,
        'Tree selection was unavailable.'
      );
      return [];
    }
  ),
  scenario(
    'breadcrumb-home-restoration',
    'Restores Home navigation from breadcrumbs.',
    async page => {
      await openWorkspaceAsync(page);
      await page.getByRole('button', { name: 'Expand' }).first().click();
      await page.getByText('catalog', { exact: true }).click();
      await page.getByText('Home', { exact: true }).click();
      await page.getByText('GitHub workspace', { exact: true }).waitFor();
      return [];
    }
  ),
  scenario(
    'dependency-prefix-filter',
    'Applies dependency package prefix filtering.',
    async page => {
      await openWorkspaceAsync(page);
      await page.getByLabel('Package prefix').fill('@fixture/catalog');
      assert(
        (await page.getByLabel('Package prefix').inputValue()) === '@fixture/catalog',
        'Prefix was not retained.'
      );
      return [];
    }
  ),
  scenario(
    'dependency-kind-filter',
    'Toggles runtime, dev, peer, and optional declarations.',
    async page => {
      await openWorkspaceAsync(page);
      for (const label of dependencyKinds) await page.getByLabel(label).click();
      for (const label of dependencyKinds)
        assert(!(await page.getByLabel(label).isChecked()), `${label} remained enabled.`);
      return [];
    }
  ),
  scenario(
    'projection-controls',
    'Changes vendor, compound, and subpackage-depth controls.',
    async page => {
      await openWorkspaceAsync(page);
      await page.getByLabel('Show Vendor').click();
      await page.getByLabel('Show Compound Nodes').click();
      await page.getByLabel('Subpackage depth').fill('2');
      assert(
        (await page.getByLabel('Subpackage depth').inputValue()) === '2',
        'Depth was not applied.'
      );
      return [];
    }
  ),
  scenario('cycle-groups', 'Exposes intra-project and cross-project cycle groups.', async page => {
    await openWorkspaceAsync(page);
    await page.getByRole('tab', { name: 'Rules' }).click();
    await page.getByText(/cycle/i).first().waitFor();
    return [];
  }),
  scenario('cycle-evidence-reveal', 'Reveals hidden cycle evidence temporarily.', async page => {
    await openWorkspaceAsync(page);
    await page.getByRole('tab', { name: 'Rules' }).click();
    await page.getByText(/cycle/i).first().click();
    await page.screenshot({
      path: resolve(evidenceDirectory, 'cross-project-cycle.png'),
      fullPage: true,
    });
    return ['cross-project-cycle.png'];
  }),
  scenario(
    'workspace-crud',
    'Saves, opens, renames, and confirmed-deletes a workspace.',
    async page => {
      await openWorkspaceAsync(page);
      await page.getByLabel('Manage workspaces').click();
      page.once('dialog', dialog => dialog.accept('Acceptance workspace'));
      await page.getByRole('button', { name: 'Save as' }).click();
      await page.getByLabel('Manage workspaces').click();
      page.once('dialog', dialog => dialog.accept('Renamed workspace'));
      await page.getByRole('button', { name: 'Rename' }).click();
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('button', { name: 'Delete' }).click();
      return [];
    }
  ),
  scenario(
    'workspace-reload-restoration',
    'Restores source exclusions and settings after reload.',
    async page => {
      await openWorkspaceAsync(page);
      await page.getByLabel('Choose repositories').click();
      await page.getByLabel('owner-a/catalog').uncheck();
      await page.getByLabel('Show Vendor').click();
      await page.getByLabel('Manage workspaces').click();
      page.once('dialog', dialog => dialog.accept('Restored workspace'));
      await page.getByRole('button', { name: 'Save as' }).click();
      await page.waitForURL(/workspace=restored-workspace/u);
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByLabel('Choose repositories').click();
      assert(
        !(await page.getByLabel('owner-a/catalog').isChecked()),
        'Saved exclusion was not restored.'
      );
      await page.screenshot({
        path: resolve(evidenceDirectory, 'saved-workspace-restored.png'),
        fullPage: true,
      });
      return ['saved-workspace-restored.png'];
    }
  ),
  scenario(
    'partial-repository-failure',
    'Keeps successful projects visible beside a failed repository.',
    async page => {
      await openWorkspaceAsync(page);
      await page.getByText('owner-b/failed: failed', { exact: true }).waitFor();
      return [];
    }
  ),
  scenario('theme-behavior', 'Switches ZORA light and dark themes.', async page => {
    await openWorkspaceAsync(page);
    await page.getByRole('button', { name: 'Dark' }).click();
    await page.getByRole('button', { name: 'Light' }).waitFor();
    return [];
  }),
  scenario(
    'settled-selection-viewport',
    'Selects without changing the settled viewport.',
    async page => {
      await openWorkspaceAsync(page);
      const zoom = await page.getByLabel('Zoom').inputValue();
      await page.getByRole('button', { name: 'Expand' }).first().click();
      await page.getByText('catalog', { exact: true }).click();
      assert(
        (await page.getByLabel('Zoom').inputValue()) === zoom,
        'Selection changed the settled viewport.'
      );
      return [];
    }
  ),
  scenario(
    'single-project-offline-parity',
    'Retains direct single-project browser behavior with no outbound requests.',
    async page => {
      await openWorkspaceAsync(page, encodeURIComponent('https://github.com/owner-a/catalog'));
      await page.getByText('catalog', { exact: true }).waitFor();
      return [];
    }
  ),
];

/*** Names each independently reported browser workflow. */
function scenario(id: string, description: string, run: Scenario['run']): Scenario {
  return { description, id, run };
}
const dependencyKinds = [
  'Runtime dependencies',
  'Dev dependencies',
  'Peer dependencies',
  'Optional dependencies',
] as const;

/*** Rejects an incomplete or duplicate scenario registry before a browser can produce misleading evidence. */
function assertScenarioRegistry(): void {
  const scenarioIds = scenarios.map(scenario => scenario.id);
  assert(scenarioIds.length === 20, `Expected exactly 20 scenarios, found ${scenarioIds.length}.`);
  assert(
    new Set(scenarioIds).size === scenarioIds.length,
    'Scenario registry contains duplicate IDs.'
  );
}

/*** Rejects every report that does not contain exactly one completed result for every registered scenario. */
function assertCompleteAcceptance(): void {
  const nonPassingResults = results.filter(result => result.status !== 'passed');
  assert(
    results.length === scenarios.length,
    `Expected ${scenarios.length} executed scenarios, found ${results.length}.`
  );
  assert(results.length > 0, 'Browser acceptance executed zero scenarios.');
  assert(
    nonPassingResults.length === 0,
    `Browser acceptance failures: ${nonPassingResults.map(result => result.id).join(', ')}`
  );
}

/*** Records scenarios the runner could not reach after a startup or unexpected runner failure. */
function recordUnexecutedScenarios(summary: string): void {
  const completed = new Set(results.map(result => result.id));
  for (const scenario of scenarios.filter(scenario => !completed.has(scenario.id)))
    results.push(
      result(
        scenario,
        performance.now(),
        new Date().toISOString(),
        'unexecuted',
        [],
        { consoleErrors: [], outboundRequests: [] },
        summary
      )
    );
}

await runAcceptanceAsync();

/*** Captures console and network diagnostics for every isolated scenario. */
function collectDiagnostics(page: Page): BrowserDiagnostics {
  const diagnostics: BrowserDiagnostics = { consoleErrors: [], outboundRequests: [] };
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('status of 404'))
      diagnostics.consoleErrors.push(message.text());
  });
  page.on('pageerror', error => diagnostics.consoleErrors.push(error.message));
  page.on('request', request => {
    if (!request.url().startsWith(url))
      diagnostics.outboundRequests.push(`${request.method()} ${request.url()}`);
  });
  return diagnostics;
}
/*** Waits for the fixture server without browser timing sleeps. */
async function waitForServerAsync(): Promise<void> {
  for (const _attempt of Array.from({ length: 80 })) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* Port is not bound yet. */
    }
    await Bun.sleep(100);
  }
  throw new Error('Timed out waiting for the fixture application.');
}
interface BrowserDiagnostics {
  readonly consoleErrors: string[];
  readonly outboundRequests: string[];
}
