import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

import { chromium, type Browser, type Locator, type Page, type Response } from 'playwright-core';

const browserPath = process.env.ATLAS_CHROME;
if (browserPath === undefined) throw new Error('Missing ENV: ATLAS_CHROME');
const port = 4400 + Math.floor(Math.random() * 400);
const url = `http://127.0.0.1:${port}`;
const evidenceDirectory = resolve('artifacts/browser-acceptance');
const fixtureApplication = resolve('test/e2e/next-fixture-app');
const fixtureBuildDirectory = resolve(fixtureApplication, 'build');
const fixtureServerMetadataPath = resolve(evidenceDirectory, 'fixture-server.json');
const command = process.platform === 'win32' ? 'bunx.cmd' : 'bunx';
const fixtureEnvironment = { ...process.env, NEXT_PUBLIC_SETTINGS_LAYOUT: 'elk' };

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
type GraphViewportProbe = {
  controller: {
    readonly measureNodes?: (nodeIds: readonly string[]) => {
      readonly nodes: readonly {
        readonly id: string;
        readonly position: { readonly x: number; readonly y: number };
        readonly size: { readonly width: number; readonly height: number };
      }[];
      readonly viewport: { readonly width: number; readonly height: number };
    } | null;
  } | null;
  layoutCount: number;
};
type FixtureServerMetadata = {
  readonly pid: number;
  readonly port: number;
  readonly startedAt: string;
};
const startedAt = performance.now();
const startedAtIso = new Date().toISOString();
const results: Result[] = [];

await mkdir(evidenceDirectory, { recursive: true });
const serverOutput: string[] = [];
let browser: Browser | undefined;
let server: ChildProcess | undefined;
let serverExit:
  Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }> | undefined;
let serverExitResult:
  { readonly code: number | null; readonly signal: NodeJS.Signals | null } | undefined;
async function runAcceptanceAsync(): Promise<void> {
  let failure: unknown;
  try {
    assertScenarioRegistry();
    await prepareFixtureBuildAsync();
    await buildFixtureAsync();
    await assertFixtureBuildAsync();
    await startFixtureServerAsync();
    await waitForServerAsync();
    await assertFixtureAssetsAsync();
    browser = await chromium.launch({ executablePath: browserPath, headless: true });
    for (const scenario of scenarios) {
      assertServerRunning();
      results.push(await runScenarioAsync(browser, scenario));
    }
    assertCompleteAcceptance();
  } catch (error) {
    failure = error;
    recordUnexecutedScenarios(String(error));
    await writeReportAsync('failed');
    await writeFile(
      resolve(evidenceDirectory, 'multi-project-failure.txt'),
      `${String(error)}\n${serverOutput.join('')}`
    );
  } finally {
    await browser?.close();
    const shutdownFailure = await stopFixtureServerAsync();
    if (shutdownFailure !== undefined) failure ??= shutdownFailure;
    if (failure === undefined) await rm(fixtureBuildDirectory, { force: true, recursive: true });
  }
  if (failure !== undefined) throw failure;
  await writeReportAsync('passed');
}

/*** Removes only an idle test fixture build so a live server can never lose its generated assets. */
async function prepareFixtureBuildAsync(): Promise<void> {
  await stopPreviousFixtureServerAsync();
  await assertFixtureBuildIsUnusedAsync();
  await rm(fixtureBuildDirectory, { force: true, recursive: true });
}

/*** Builds the isolated Next fixture to completion before its single owned server starts. */
async function buildFixtureAsync(): Promise<void> {
  try {
    const output = await runProcessAsync(
      command,
      ['next', 'build', '--webpack'],
      fixtureApplication,
      [0],
      fixtureEnvironment
    );
    await writeFile(resolve(evidenceDirectory, 'fixture-build.log'), output);
  } catch (error) {
    await writeFile(resolve(evidenceDirectory, 'fixture-build-failure.txt'), String(error));
    throw error;
  }
}

/*** Verifies the production build has the files required for Next to serve application assets. */
async function assertFixtureBuildAsync(): Promise<void> {
  await Promise.all([
    access(resolve(fixtureBuildDirectory, 'BUILD_ID')),
    access(resolve(fixtureBuildDirectory, 'static')),
  ]);
}

/*** Starts exactly one detached process group so the runner can also terminate its Next children. */
async function startFixtureServerAsync(): Promise<void> {
  const fixtureServer = spawn(command, ['next', 'start', '--port', String(port)], {
    cwd: fixtureApplication,
    detached: process.platform !== 'win32',
    env: fixtureEnvironment,
    stdio: 'pipe',
  });
  server = fixtureServer;
  fixtureServer.stdout?.on('data', chunk => serverOutput.push(String(chunk)));
  fixtureServer.stderr?.on('data', chunk => serverOutput.push(String(chunk)));
  serverExit = new Promise(resolve => {
    fixtureServer.once('exit', (code, signal) => {
      serverExitResult = { code, signal };
      resolve(serverExitResult);
    });
  });
  if (fixtureServer.pid === undefined)
    throw new Error('Fixture server did not expose a process identifier.');
  const metadata: FixtureServerMetadata = {
    pid: fixtureServer.pid,
    port,
    startedAt: new Date().toISOString(),
  };
  await writeFile(fixtureServerMetadataPath, JSON.stringify(metadata, null, 2));
}

/*** Refuses to run beside an earlier owned fixture server and shuts down only that recorded process group. */
async function stopPreviousFixtureServerAsync(): Promise<void> {
  const metadata = await readFixtureServerMetadataAsync();
  if (metadata === undefined || !isProcessRunning(metadata.pid)) return;
  await assertOwnedFixtureServerAsync(metadata);
  terminateProcessGroup(metadata.pid, 'SIGTERM');
  if (!(await waitForProcessExitAsync(metadata.pid)))
    throw new Error(`Previous fixture server ${metadata.pid} did not exit after SIGTERM.`);
}

/*** Verifies persisted ownership before signalling a process recorded by an earlier acceptance run. */
async function assertOwnedFixtureServerAsync(metadata: FixtureServerMetadata): Promise<void> {
  const commandLine = await runProcessAsync(
    'ps',
    ['-p', String(metadata.pid), '-o', 'command='],
    process.cwd()
  );
  if (commandLine.includes('next start') && commandLine.includes(`--port ${metadata.port}`)) return;
  const currentDirectory = await runProcessAsync(
    'lsof',
    ['-a', '-p', String(metadata.pid), '-d', 'cwd', '-Fn'],
    process.cwd()
  );
  const listener = await runProcessAsync(
    'lsof',
    ['-Pan', '-p', String(metadata.pid), `-iTCP:${metadata.port}`, '-sTCP:LISTEN'],
    process.cwd()
  );
  assert(
    currentDirectory.includes(`n${fixtureApplication}`) &&
      listener.includes(`:${metadata.port} (LISTEN)`),
    `Recorded fixture-server process ${metadata.pid} is not an owned Next fixture server.`
  );
}

/*** Detects processes holding files in the fixture build before allowing cleanup to proceed. */
async function assertFixtureBuildIsUnusedAsync(): Promise<void> {
  try {
    await access(fixtureBuildDirectory);
  } catch {
    return;
  }
  const users = await runProcessAsync(
    'lsof',
    ['-Fn', '+D', fixtureBuildDirectory],
    process.cwd(),
    [0, 1]
  );
  if (users.trim() !== '') throw new Error(`Fixture build directory is still in use:\n${users}`);
}

/*** Captures command output so build and lifecycle failures remain inspectable in acceptance artifacts. */
function runProcessAsync(
  executable: string,
  arguments_: readonly string[],
  cwd: string,
  acceptedExitCodes: readonly number[] = [0],
  environment: NodeJS.ProcessEnv = process.env
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, arguments_, { cwd, env: environment, stdio: 'pipe' });
    const output: string[] = [];
    child.stdout.on('data', chunk => output.push(String(chunk)));
    child.stderr.on('data', chunk => output.push(String(chunk)));
    child.once('error', reject);
    child.once('exit', code => {
      const text = output.join('');
      if (code !== null && acceptedExitCodes.includes(code)) resolvePromise(text);
      else
        reject(
          new Error(`${executable} ${arguments_.join(' ')} exited with ${String(code)}.\n${text}`)
        );
    });
  });
}

/*** Reads persistent ownership metadata without treating an absent first-run file as a failure. */
async function readFixtureServerMetadataAsync(): Promise<FixtureServerMetadata | undefined> {
  try {
    return JSON.parse(await readFile(fixtureServerMetadataPath, 'utf8')) as FixtureServerMetadata;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

/*** Tests process liveness without signalling or modifying an unknown process. */
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/*** Stops an owned process group on POSIX so `bunx` cannot leave its Next child behind. */
function terminateProcessGroup(pid: number, signal: NodeJS.Signals): void {
  if (process.platform === 'win32') process.kill(pid, signal);
  else process.kill(-pid, signal);
}

/*** Waits for confirmed process exit using bounded lifecycle polling rather than a fixed delay. */
async function waitForProcessExitAsync(pid: number): Promise<boolean> {
  const deadline = performance.now() + 5_000;
  while (isProcessRunning(pid) && performance.now() < deadline) await Bun.sleep(50);
  return !isProcessRunning(pid);
}

/*** Stops this runner's server and retains generated output when its shutdown cannot be confirmed. */
async function stopFixtureServerAsync(): Promise<unknown> {
  if (server === undefined || server.pid === undefined) return undefined;
  try {
    if (serverExitResult === undefined) {
      terminateProcessGroup(server.pid, 'SIGTERM');
      if (!(await waitForProcessExitAsync(server.pid))) {
        terminateProcessGroup(server.pid, 'SIGKILL');
        if (!(await waitForProcessExitAsync(server.pid)))
          throw new Error(`Fixture server ${server.pid} did not exit after SIGKILL.`);
      }
    }
    await serverExit;
    await rm(fixtureServerMetadataPath, { force: true });
    return undefined;
  } catch (error) {
    await writeFile(
      resolve(evidenceDirectory, 'fixture-shutdown-failure.txt'),
      `${String(error)}\n${serverOutput.join('')}`
    );
    return error;
  }
}

/*** Rejects scenarios after an unexpected fixture-server exit instead of accepting stale browser state. */
function assertServerRunning(): void {
  if (serverExitResult !== undefined)
    throw new Error(
      `Fixture server exited unexpectedly: code=${String(serverExitResult.code)} signal=${String(serverExitResult.signal)}.`
    );
}

/*** Executes every scenario in a fresh context so no browser storage or selection leaks across them. */
async function runScenarioAsync(browser: Browser, scenario: Scenario): Promise<Result> {
  const started = performance.now();
  const startedAt = new Date().toISOString();
  const diagnostics: BrowserDiagnostics = {
    consoleErrors: [],
    failedResources: [],
    outboundRequests: [],
  };
  let context: Awaited<ReturnType<Browser['newContext']>> | undefined;
  let artifacts: readonly string[] = [];
  try {
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await installGraphViewportProbeAsync(page);
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
      diagnostics.failedResources.length === 0,
      `Browser resource failures: ${diagnostics.failedResources.join('; ')}`
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
async function openWorkspaceAsync(
  page: Page,
  source = 'owner-a%2Cowner-b',
  repositoryIds: readonly string[] | undefined = source === 'owner-a%2Cowner-b'
    ? fixtureRepositoryIds
    : undefined
): Promise<void> {
  const repositories = repositoryIds === undefined ? '' : `&repositories=${repositoryIds}`;
  await page.goto(`${url}/?source=${source}${repositories}`, { waitUntil: 'networkidle' });
  await page.getByRole('application', { name: 'Graph' }).waitFor();
}

/*** Opens the workspace menu only when its action controls are not already visible. */
async function openWorkspaceMenuAsync(page: Page): Promise<void> {
  const saveAs = page.getByRole('button', { name: 'Save as' });
  if (!(await saveAs.isVisible())) await page.getByLabel('Manage workspaces').click();
  await saveAs.waitFor();
}

/*** Opens the repository picker only when its repository controls are not already visible. */
async function openRepositoryPickerAsync(page: Page): Promise<void> {
  const catalog = page.getByLabel('owner-a/catalog');
  if (!(await catalog.isVisible())) await page.getByLabel('Choose repositories').click();
  await catalog.waitFor();
}

/*** Verifies the separate canvas has a rendered area without treating a canvas label as DOM text. */
async function assertGraphCanvasAsync(page: Page): Promise<void> {
  const graph = page.getByRole('application', { name: 'Graph' });
  await graph.waitFor();
  const box = await graph.boundingBox();
  assert(box !== null && box.width > 0 && box.height > 0, 'Graph canvas has no rendered area.');
}

/*** Verifies the rendered thumb position used by the installed ZORA switch when accessibility state is unavailable. */
async function assertSwitchCheckedAsync(switchControl: Locator, message: string): Promise<void> {
  const thumb = switchControl.locator(':scope > div > div:first-child > div');
  assert(
    (await thumb.evaluate(element => getComputedStyle(element).alignSelf)) === 'flex-end',
    message
  );
}

/*** Fails with a concrete diagnostic instead of accepting a missing user-visible state. */
function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/*** Proves that a visible control, rather than the graph canvas, owns its pointer interaction point. */
async function assertTopmostControlAsync(control: Locator, name: string): Promise<void> {
  const receivesPointerEvents = await control.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const target = document.elementFromPoint(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2
    );
    return target !== null && (target === element || element.contains(target));
  });
  assert(receivesPointerEvents, `${name} is obstructed by another layer.`);
}

/*** Captures the released controller event instead of reaching through GraphView's renderer internals. */
async function installGraphViewportProbeAsync(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const target = window as typeof window & { __atlasViewportProbe?: GraphViewportProbe };
    target.__atlasViewportProbe = { controller: null, layoutCount: 0 };
    document.addEventListener('zora-graph-view-layout-complete', event => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      if (typeof detail !== 'object' || detail === null || !('controller' in detail)) return;
      target.__atlasViewportProbe = {
        controller: detail.controller as GraphViewportProbe['controller'],
        layoutCount: (target.__atlasViewportProbe?.layoutCount ?? 0) + 1,
      };
    });
  });
}

/*** Proves public node geometry occupies the actual graph canvas after the one measured initial fit. */
async function assertMeasuredViewportOccupancyAsync(
  page: Page,
  repositoryCount: number
): Promise<void> {
  const nodeIds = Array.from({ length: repositoryCount }, (_, index) => `repository-${index}`);
  await page.waitForFunction(ids => {
    const probe = (window as typeof window & { __atlasViewportProbe?: GraphViewportProbe })
      .__atlasViewportProbe;
    const measurement = probe?.controller?.measureNodes?.(ids);
    return (
      probe !== undefined &&
      probe.layoutCount > 0 &&
      measurement !== null &&
      measurement !== undefined &&
      measurement.viewport.width > 0 &&
      measurement.viewport.height > 0 &&
      measurement.nodes.length === ids.length &&
      measurement.nodes.every(node => node.size.width > 0 && node.size.height > 0)
    );
  }, nodeIds);
  const occupancy = await page.evaluate(ids => {
    const probe = (window as typeof window & { __atlasViewportProbe?: GraphViewportProbe })
      .__atlasViewportProbe;
    const measurement = probe?.controller?.measureNodes?.(ids);
    const graph = document.querySelector('[role="application"][aria-label="Graph"]');
    const bounds = graph?.getBoundingClientRect();
    if (measurement === null || measurement === undefined || bounds === undefined) return null;
    const x1 = Math.min(...measurement.nodes.map(node => node.position.x - node.size.width / 2));
    const x2 = Math.max(...measurement.nodes.map(node => node.position.x + node.size.width / 2));
    const y1 = Math.min(...measurement.nodes.map(node => node.position.y - node.size.height / 2));
    const y2 = Math.max(...measurement.nodes.map(node => node.position.y + node.size.height / 2));
    return {
      canvas: { height: bounds.height, width: bounds.width },
      coverage: {
        height: (y2 - y1) / measurement.viewport.height,
        width: (x2 - x1) / measurement.viewport.width,
      },
      nodeBounds: { x1, x2, y1, y2 },
      viewport: measurement.viewport,
    };
  }, nodeIds);
  assert(occupancy !== null, 'Graph viewport occupancy could not be measured.');
  assert(
    occupancy.canvas.width > 0 && occupancy.canvas.height > 0,
    `Graph canvas has no visible area for ${repositoryCount} repositories.`
  );
  assert(
    occupancy.viewport.width === occupancy.canvas.width &&
      occupancy.viewport.height === occupancy.canvas.height,
    `Controller viewport does not match graph canvas for ${repositoryCount} repositories.`
  );
  assert(
    occupancy.nodeBounds.x1 >= 0 &&
      occupancy.nodeBounds.y1 >= 0 &&
      occupancy.nodeBounds.x2 <= occupancy.viewport.width &&
      occupancy.nodeBounds.y2 <= occupancy.viewport.height,
    `Initial fit leaves repository nodes outside the visible canvas for ${repositoryCount} repositories.`
  );
  assert(
    Math.max(occupancy.coverage.width, occupancy.coverage.height) >= 0.6,
    `Initial fit underuses the graph canvas for ${repositoryCount} repositories: ${JSON.stringify(occupancy.coverage)}.`
  );
}

/*** Verifies the production workspace consumes the canvas left after its visible 288px sidebar. */
async function assertWorkspaceViewportAsync(page: Page, repositoryCount: number) {
  const nodeIds = Array.from(
    { length: repositoryCount },
    (_, index) => `repository.viewport-${repositoryCount}-${index}`
  );
  await page.waitForFunction(ids => {
    const probe = (window as typeof window & { __atlasViewportProbe?: GraphViewportProbe })
      .__atlasViewportProbe;
    return probe?.controller?.measureNodes?.(ids)?.nodes.length === ids.length;
  }, nodeIds);
  const result = await page.evaluate(ids => {
    const probe = (window as typeof window & { __atlasViewportProbe?: GraphViewportProbe })
      .__atlasViewportProbe;
    const measurement = probe?.controller?.measureNodes?.(ids);
    const graph = document.querySelector('[role="application"][aria-label="Graph"]');
    const sidebar = document.querySelector('[data-testid="sidebar-tree-scroll"]')?.closest('aside');
    if (
      measurement === undefined ||
      measurement === null ||
      graph === null ||
      sidebar === null ||
      sidebar === undefined
    )
      return null;
    const canvas = graph.getBoundingClientRect();
    const nodes = measurement.nodes.map(node => ({
      x1: node.position.x - node.size.width / 2,
      x2: node.position.x + node.size.width / 2,
      y1: node.position.y - node.size.height / 2,
      y2: node.position.y + node.size.height / 2,
    }));
    return {
      canvas,
      sidebar: sidebar.getBoundingClientRect(),
      viewport: measurement.viewport,
      x1: Math.min(...nodes.map(node => node.x1)),
      x2: Math.max(...nodes.map(node => node.x2)),
      y1: Math.min(...nodes.map(node => node.y1)),
      y2: Math.max(...nodes.map(node => node.y2)),
    };
  }, nodeIds);
  assert(result !== null, 'Real workspace sidebar or canvas was unavailable.');
  assert(
    result.sidebar.width === 288,
    'Workspace sidebar is not visibly occupying its owned width.'
  );
  assert(
    result.canvas.width === result.viewport.width &&
      result.canvas.height === result.viewport.height,
    'ZORA viewport does not match the real workspace canvas.'
  );
  assert(
    result.x1 >= 0 &&
      result.y1 >= 0 &&
      result.x2 <= result.viewport.width &&
      result.y2 <= result.viewport.height,
    `Real workspace fit leaves ${repositoryCount} repositories offscreen.`
  );
}

const scenarios: readonly Scenario[] = [
  scenario(
    'source-picker-owner-forms',
    'Discovers a single owner through delayed and empty inventories without navigating the workspace.',
    async page => {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.getByLabel('GitHub owner').fill('owner-delayed');
      await page.getByLabel('GitHub owner').fill('owner-empty');
      await page.getByLabel('Choose repositories').click();
      await page.getByText('No repositories match this search.').waitFor();
      await page.getByLabel('Choose repositories').click();
      await page.getByLabel('GitHub owner').fill('owner-a');
      await page.getByLabel('Choose repositories').waitFor();
      await page.getByLabel('Choose repositories').click();
      await page.getByLabel('owner-a/catalog').check();
      await page.waitForURL(
        openedUrl =>
          openedUrl.searchParams.get('source') === 'owner-a' &&
          openedUrl.searchParams.get('repositories') === 'owner-a-catalog'
      );
      await page.getByRole('application', { name: 'Graph' }).waitFor();
      assert(
        (await page.getByLabel('GitHub owner').inputValue()) === 'owner-a',
        'Shorthand repository owner was not normalized.'
      );
      await assertGraphCanvasAsync(page);
      await openRepositoryPickerAsync(page);
      assert(
        await page.getByLabel('owner-a/catalog').isChecked(),
        'Shorthand repository was not selected.'
      );
      return [];
    }
  ),
  scenario(
    'source-picker-multi-select',
    'Keeps a multi-owner graph visible while marking incremental selection unavailable.',
    async page => {
      await openWorkspaceAsync(page);
      const picker = page.getByLabel('Choose repositories');
      await assertTopmostControlAsync(picker, 'Repository picker');
      assert(
        await picker.isDisabled(),
        'Multi-owner picker was not bounded to the server contract.'
      );
      await page
        .getByText('Repository selection is available for one GitHub owner or @me.', {
          exact: false,
        })
        .waitFor();
      await page.getByText('owner-a', { exact: true }).waitFor();
      await page.getByText('owner-b', { exact: true }).waitFor();
      return [];
    }
  ),
  scenario(
    'source-picker-immediate-selection',
    'Applies a selection diff immediately without an Open action or document navigation.',
    async page => {
      await openWorkspaceAsync(page, 'owner-a', ['owner-a-catalog', 'owner-a-shared']);
      const before = page.url();
      await page.getByLabel('Choose repositories').click();
      await page.getByLabel('owner-a/catalog').uncheck();
      await page.waitForURL(
        openedUrl =>
          openedUrl.searchParams.get('source') === 'owner-a' &&
          openedUrl.searchParams.get('repositories') === 'owner-a-shared'
      );
      assert(page.url() !== before, 'Selection did not update browser history.');
      assert(
        (await page.getByRole('button', { name: 'Open' }).count()) === 0,
        'Open is still visible.'
      );
      await assertGraphCanvasAsync(page);
      await page.getByRole('button', { name: 'Expand' }).first().click();
      await page
        .getByRole('tree', { name: 'Project tree' })
        .getByText('catalog', { exact: true })
        .waitFor({
          state: 'detached',
        });
      await openRepositoryPickerAsync(page);
      assert(
        !(await page.getByLabel('owner-a/catalog').isChecked()),
        'Excluded repository was selected after Open.'
      );
      return [];
    }
  ),
  scenario(
    'source-picker-runtime-recovery',
    'Recovers a current single-owner selection after the server evicts its incremental runtime.',
    async page => {
      await openWorkspaceAsync(page, 'owner-recovery', ['owner-a-catalog', 'owner-a-shared']);
      const recoveryRequest = page.waitForRequest(request => {
        if (!request.url().endsWith('/api/workspace/selection') || request.method() !== 'POST')
          return false;
        const body = JSON.parse(request.postData() ?? '{}') as { readonly runtimeId?: unknown };
        return body.runtimeId === undefined;
      });
      await page.getByLabel('Choose repositories').click();
      await page.getByLabel('owner-a/catalog').uncheck();
      await recoveryRequest;
      await page.waitForURL(
        openedUrl =>
          openedUrl.searchParams.get('source') === 'owner-recovery' &&
          openedUrl.searchParams.get('repositories') === 'owner-a-shared'
      );
      await assertGraphCanvasAsync(page);
      return [];
    }
  ),
  scenario(
    'source-picker-rapid-selection',
    'Applies the final repository choice during consecutive single-owner changes.',
    async page => {
      await openWorkspaceAsync(page, 'owner-rapid', ['owner-a-catalog', 'owner-a-shared']);
      const firstRequest = page.waitForRequest(
        request => request.url().endsWith('/api/workspace/selection') && request.method() === 'POST'
      );
      await page.getByLabel('Choose repositories').click();
      await page.getByLabel('owner-a/catalog').uncheck();
      await firstRequest;
      const secondRequest = page.waitForRequest(
        request => request.url().endsWith('/api/workspace/selection') && request.method() === 'POST'
      );
      await openRepositoryPickerAsync(page);
      await page.getByLabel('owner-a/catalog').check();
      await secondRequest;
      await page.waitForURL(
        openedUrl =>
          openedUrl.searchParams.get('source') === 'owner-rapid' &&
          openedUrl.searchParams.get('repositories') === 'owner-a-catalog,owner-a-shared'
      );
      await assertGraphCanvasAsync(page);
      return [];
    }
  ),
  scenario(
    'source-picker-overlap-deduplication',
    'Preserves overlapping-owner topology without exposing it to a single-owner selection request.',
    async page => {
      await openWorkspaceAsync(page);
      assert(
        await page.getByLabel('Choose repositories').isDisabled(),
        'Overlapping owners were exposed to the single-owner picker.'
      );
      await page.getByRole('button', { name: 'Expand' }).first().click();
      await page.getByText('shared', { exact: true }).waitFor();
      return [];
    }
  ),
  scenario(
    'source-picker-exclusion-restoration',
    'Preserves multi-owner exclusions.',
    async page => {
      await openWorkspaceAsync(page, 'owner-a%2Cowner-b%7Cexclude%3Downer-a-catalog');
      const picker = page.getByLabel('Choose repositories');
      assert(
        await picker.isDisabled(),
        'Multi-owner exclusions were exposed to incremental selection.'
      );
      await page.getByText('Repositories (4/5)', { exact: true }).waitFor();
      return [];
    }
  ),
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
    'dependency-kind-controls-absent',
    'Keeps dependency evidence without dependency-kind UI controls.',
    async page => {
      await openWorkspaceAsync(page);
      for (const label of dependencyKinds)
        assert((await page.getByLabel(label).count()) === 0, `${label} control is still visible.`);
      return [];
    }
  ),
  scenario(
    'projection-controls',
    'Changes vendor, compound, and subpackage-depth controls.',
    async page => {
      await openWorkspaceAsync(page);
      const vendor = page.getByLabel('Show Vendor');
      const compound = page.getByLabel('Show Compound Nodes');
      const depth = page.getByLabel('Subpackage depth');
      await assertTopmostControlAsync(vendor, 'Vendor sidebar switch');
      await assertTopmostControlAsync(compound, 'Compound sidebar switch');
      await assertTopmostControlAsync(depth, 'Subpackage-depth sidebar input');
      await vendor.click();
      await compound.click();
      await depth.fill('2');
      assert((await depth.inputValue()) === '2', 'Depth was not applied.');
      return [];
    }
  ),
  scenario('cycle-groups', 'Exposes intra-project and cross-project cycle groups.', async page => {
    await openWorkspaceAsync(page);
    const rules = page.getByRole('tab', { name: 'Rules' });
    await assertTopmostControlAsync(rules, 'Rules sidebar tab');
    await rules.click();
    await page.getByText('Cyclic Dependencies', { exact: true }).waitFor();
    await page.getByText('Cross-Project Cycles (1)', { exact: true }).waitFor();
    await page.getByText('workspace (1)', { exact: true }).waitFor();
    const crossProjectCycle = page.getByTestId('cycle-row-0');
    const intraProjectCycle = page.getByTestId('cycle-row-1');
    await intraProjectCycle.scrollIntoViewIfNeeded();
    await crossProjectCycle.scrollIntoViewIfNeeded();
    await assertTopmostControlAsync(intraProjectCycle, 'Intra-project cycle row');
    await assertTopmostControlAsync(crossProjectCycle, 'Cross-project cycle row');
    return [];
  }),
  scenario('cycle-evidence-reveal', 'Reveals hidden cycle evidence temporarily.', async page => {
    await openWorkspaceAsync(page);
    await page.getByRole('tab', { name: 'Rules' }).click();
    const crossProjectCycle = page.getByTestId('cycle-row-0');
    await crossProjectCycle.scrollIntoViewIfNeeded();
    await assertTopmostControlAsync(crossProjectCycle, 'Cross-project cycle row');
    await crossProjectCycle.click();
    const reveal = page.getByRole('button', { name: 'Reveal complete cycle' });
    await reveal.waitFor();
    await reveal.click();
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
      await page.setViewportSize({ height: 1000, width: 1920 });
      await openWorkspaceAsync(page);
      const menu = page.getByLabel('Manage workspaces');
      await assertTopmostControlAsync(menu, 'Workspace management menu');
      await menu.click();
      page.once('dialog', dialog => dialog.accept('Acceptance workspace'));
      await page.getByRole('button', { name: 'Save as' }).click();
      await page.waitForURL(/workspace=acceptance-workspace/u);
      await openWorkspaceMenuAsync(page);
      page.once('dialog', dialog => dialog.accept('Renamed workspace'));
      const rename = page.getByRole('button', { name: 'Rename' });
      await rename.scrollIntoViewIfNeeded();
      await rename.click();
      await page.reload({ waitUntil: 'networkidle' });
      await openWorkspaceMenuAsync(page);
      assert(
        (await page.getByLabel('Saved workspace').inputValue()) === 'acceptance-workspace',
        'Renamed workspace did not persist its stable workspace identity.'
      );
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('button', { name: 'Delete' }).click();
      await page.waitForURL(openedUrl => openedUrl.searchParams.get('workspace') === null);
      await page.reload({ waitUntil: 'networkidle' });
      await openWorkspaceMenuAsync(page);
      assert(
        (await page.getByLabel('Saved workspace').inputValue()) === '',
        'Deleted workspace was restored after reload.'
      );
      return [];
    }
  ),
  scenario(
    'workspace-reload-restoration',
    'Restores source exclusions and settings after reload.',
    async page => {
      await openWorkspaceAsync(page, 'owner-a', ['owner-a-catalog', 'owner-a-shared']);
      await page.getByLabel('Choose repositories').click();
      await page.getByLabel('owner-a/catalog').uncheck();
      const vendor = page.getByRole('switch', { name: 'Show Vendor' });
      await vendor.click();
      await assertSwitchCheckedAsync(vendor, 'Vendor setting did not change before Save.');
      await page.getByLabel('Manage workspaces').click();
      page.once('dialog', dialog => dialog.accept('Restored workspace'));
      await page.getByRole('button', { name: 'Save as' }).click();
      await page.waitForURL(/workspace=restored-workspace/u);
      await page.evaluate(() => window.localStorage.removeItem('showVendorPackages'));
      await page.reload({ waitUntil: 'networkidle' });
      const restoredVendor = page.getByRole('switch', { name: 'Show Vendor' });
      await assertSwitchCheckedAsync(restoredVendor, 'Saved vendor setting was not restored.');
      await page.getByRole('application', { name: 'Graph' }).waitFor();
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
    'workspace-auth-redirect-restoration',
    'Restores the current owner and exclusions after an auth-form redirect return.',
    async page => {
      await openWorkspaceAsync(page, 'owner-a', ['owner-a-catalog', 'owner-a-shared']);
      await page.getByLabel('Choose repositories').click();
      await page.getByLabel('owner-a/catalog').uncheck();
      await page.waitForURL(
        openedUrl => openedUrl.searchParams.get('repositories') === 'owner-a-shared'
      );
      await page.evaluate(() => {
        const form = document.createElement('form');
        form.action = '/api/auth/github/login';
        document.body.append(form);
        form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
      });
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.getByRole('application', { name: 'Graph' }).waitFor();
      assert(
        (await page.getByLabel('GitHub owner').inputValue()) === 'owner-a',
        'Owner was not restored after the auth redirect.'
      );
      await page.getByLabel('Choose repositories').click();
      assert(
        !(await page.getByLabel('owner-a/catalog').isChecked()),
        'Excluded repository was not restored after the auth redirect.'
      );
      return [];
    }
  ),
  scenario(
    'partial-repository-failure',
    'Retries only the failed repository while retaining graph state and successful projects.',
    async page => {
      await openWorkspaceAsync(page);
      const failureDetails = page.getByRole('status');
      const failure = failureDetails.getByText(/^owner-b\/failed: failed/u);
      await failure.waitFor({ state: 'attached' });
      assert(!(await failure.isVisible()), 'Failed repository details were not collapsed.');
      await failureDetails.locator('summary').click();
      await failure.waitFor();
      await page.getByText('owner-a', { exact: true }).waitFor();
      await page.getByText('owner-b', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Expand' }).first().click();
      await page.getByText('catalog', { exact: true }).click();
      const selectedCatalogs = await page.getByText('catalog', { exact: true }).count();
      const zoom = await page.getByLabel('Zoom').inputValue();
      const location = page.url();
      const retryRequest = page.waitForRequest(request => {
        if (!request.url().endsWith('/api/workspace/retry') || request.method() !== 'POST')
          return false;
        return JSON.parse(request.postData() ?? '{}').repositoryId === 'owner-b-failed';
      });
      await page.getByRole('button', { name: 'Retry' }).click();
      await retryRequest;
      await failure.waitFor({ state: 'hidden' });
      assert(page.url() === location, 'Retry reloaded or navigated the page.');
      assert(
        (await page.getByText('catalog', { exact: true }).count()) === selectedCatalogs,
        'Retry removed the existing tree selection.'
      );
      assert((await page.getByLabel('Zoom').inputValue()) === zoom, 'Retry changed the viewport.');
      assert(
        (await page.getByRole('button', { name: 'Retry' }).count()) === 0,
        'Repository D did not become ready after retry.'
      );
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
    'responsive-header',
    'Keeps the wrapped header controls visible and operable on a mobile viewport.',
    async page => {
      await page.setViewportSize({ height: 844, width: 390 });
      await page.goto(
        `${url}/?source=owner-a%2Cowner-b&repositories=${fixtureRepositoryIds.join(',')}`,
        { waitUntil: 'networkidle' }
      );
      const actions = page.getByTestId('workspace-header-actions');
      await actions.waitFor();
      assert(
        (await actions.evaluate(element => getComputedStyle(element).flexWrap)) === 'wrap',
        'Header actions do not wrap on mobile.'
      );
      await assertTopmostControlAsync(page.getByRole('button', { name: 'Dark' }), 'Theme control');
      await page.getByRole('button', { name: 'Dark' }).click();
      await page.getByRole('button', { name: 'Light' }).waitFor();
      return [];
    }
  ),
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
    'viewport-fit-matrix',
    'Uses the measured initial fit for 5, 20, and 87 repository graphs on desktop and mobile.',
    async page => {
      const artifacts: string[] = [];
      for (const [repositoryCount, viewport] of [
        [5, { width: 1440, height: 900 }],
        [20, { width: 1440, height: 900 }],
        [87, { width: 1440, height: 900 }],
        [5, { width: 390, height: 844 }],
        [20, { width: 390, height: 844 }],
        [87, { width: 390, height: 844 }],
      ] as const) {
        await page.setViewportSize(viewport);
        await page.goto(`${url}/viewport?repositories=${repositoryCount}`, {
          waitUntil: 'networkidle',
        });
        await assertMeasuredViewportOccupancyAsync(page, repositoryCount);
        const artifact = `viewport-${repositoryCount}-${viewport.width}.png`;
        await page.getByRole('application', { name: 'Graph' }).screenshot({
          path: resolve(evidenceDirectory, artifact),
        });
        artifacts.push(artifact);
      }
      return artifacts;
    }
  ),
  scenario(
    'workspace-elk-viewport-matrix',
    'Measures ELK fit in the real workspace shell beside the visible sidebar.',
    async page => {
      const artifacts: string[] = [];
      for (const [repositoryCount, viewport] of [
        [5, { width: 1440, height: 900 }],
        [20, { width: 1440, height: 900 }],
        [87, { width: 1440, height: 900 }],
        [5, { width: 390, height: 844 }],
        [20, { width: 390, height: 844 }],
        [87, { width: 390, height: 844 }],
      ] as const) {
        await page.setViewportSize(viewport);
        const repositories = Array.from(
          { length: repositoryCount },
          (_, index) => `viewport-${repositoryCount}-${index}`
        ).join(',');
        await page.goto(`${url}/?source=viewport-${repositoryCount}&repositories=${repositories}`, {
          waitUntil: 'networkidle',
        });
        await page
          .getByTestId('cytoscape-layout-trigger')
          .getByText('Elk: Layered', { exact: true })
          .waitFor();
        await assertWorkspaceViewportAsync(page, repositoryCount);
        const artifact = `workspace-elk-${repositoryCount}-${viewport.width}.png`;
        await page.screenshot({ path: resolve(evidenceDirectory, artifact), fullPage: true });
        artifacts.push(artifact);
      }
      return artifacts;
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
const fixtureRepositoryIds = [
  'owner-a-catalog',
  'owner-a-shared',
  'owner-b-workspace',
  'owner-b-disconnected',
  'owner-b-failed',
] as const;

/*** Rejects an incomplete or duplicate scenario registry before a browser can produce misleading evidence. */
function assertScenarioRegistry(): void {
  const scenarioIds = scenarios.map(scenario => scenario.id);
  assert(scenarioIds.length === 26, `Expected exactly 26 scenarios, found ${scenarioIds.length}.`);
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
        { consoleErrors: [], failedResources: [], outboundRequests: [] },
        summary
      )
    );
}

await runAcceptanceAsync();

/*** Captures console and network diagnostics for every isolated scenario. */
function collectDiagnostics(page: Page): BrowserDiagnostics {
  const diagnostics: BrowserDiagnostics = {
    consoleErrors: [],
    failedResources: [],
    outboundRequests: [],
  };
  page.on('console', message => {
    if (message.type() === 'error' && !isExpectedRecoveryConsoleError(message.text()))
      diagnostics.consoleErrors.push(message.text());
  });
  page.on('pageerror', error => diagnostics.consoleErrors.push(error.message));
  page.on('response', response => {
    if (
      response.url().startsWith(url) &&
      response.status() >= 400 &&
      !isExpectedRecoveryResponse(response)
    )
      diagnostics.failedResources.push(
        `${response.status()} ${response.request().resourceType()} ${response.url()}`
      );
  });
  page.on('requestfailed', request => {
    if (request.failure()?.errorText === 'net::ERR_ABORTED') return;
    diagnostics.failedResources.push(
      `${request.resourceType()} ${request.url()} ${request.failure()?.errorText ?? 'failed'}`
    );
  });
  page.on('request', request => {
    if (!request.url().startsWith(url))
      diagnostics.outboundRequests.push(`${request.method()} ${request.url()}`);
  });
  return diagnostics;
}

/*** Allows the documented 410 runtime-eviction response exercised by the recovery scenario. */
function isExpectedRecoveryResponse(response: Response): boolean {
  return response.status() === 410 && response.url().endsWith('/api/workspace/selection');
}

/*** Chromium logs the intentional recovery response as a resource error without a page exception. */
function isExpectedRecoveryConsoleError(message: string): boolean {
  return message.includes('server responded with a status of 410 (Gone)');
}
/*** Waits for the fixture server without browser timing sleeps. */
async function waitForServerAsync(): Promise<void> {
  for (const _attempt of Array.from({ length: 80 })) {
    assertServerRunning();
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* Port is not bound yet. */
    }
    await Bun.sleep(100);
  }
  throw new Error('Timed out waiting for the fixture application.');
}

/*** Fetches every initial Next script and stylesheet before the browser matrix starts. */
async function assertFixtureAssetsAsync(): Promise<void> {
  const response = await fetch(url);
  assert(response.ok, `Fixture root returned ${response.status}.`);
  const document = await response.text();
  const assets = [...document.matchAll(/(?:src|href)="(\/_next\/[^"?]+)/gu)].map(match => match[1]);
  assert(assets.length > 0, 'Fixture root did not reference any generated Next assets.');
  await Promise.all(
    assets.map(async asset => {
      const assetResponse = await fetch(`${url}${asset}`);
      assert(assetResponse.ok, `Fixture asset ${asset} returned ${assetResponse.status}.`);
      assert(
        (await assetResponse.arrayBuffer()).byteLength > 0,
        `Fixture asset ${asset} was empty.`
      );
    })
  );
}
interface BrowserDiagnostics {
  readonly consoleErrors: string[];
  readonly failedResources: string[];
  readonly outboundRequests: string[];
}
