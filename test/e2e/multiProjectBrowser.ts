import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

import {
  chromium,
  type Browser,
  type Locator,
  type Page,
  type Request,
  type Response,
} from 'playwright-core';

import { createPackageGraphElements } from '@/features/graph-view/adapters/inbound/cytoscape/createPackageGraphElements';
import { createGraphViewModel } from '@/features/graph-view/adapters/inbound/react/createGraphViewModel';
import { projectVisibleGraph } from '@/features/graph-view/utils/projectVisibleGraph';
import { readSettingsEnvironment } from '@/features/settings/utils/readSettingsEnvironment';

import { loadFixtureWorkspaceAsync } from './fixtureWorkspace';

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
  readonly hasTouch?: boolean;
  readonly id: string;
  readonly run: (page: Page) => Promise<readonly string[]>;
};
type GraphViewportProbe = {
  controller: {
    readonly getViewport: () => {
      readonly pan: { readonly x: number; readonly y: number };
      readonly zoom: number;
    };
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
type GraphCoordinate = {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
};
type GraphGestureProbe = {
  mouseDownCount: number;
  mouseMoveCount: number;
  mouseUpCount: number;
};
type GraphTouchDiagnostics = {
  readonly loading: { readonly present: boolean; readonly text: string };
  readonly measuredNodeIds: readonly string[];
  readonly selection: {
    readonly selectedRepositoryCheckboxes: readonly {
      readonly checked: string | null;
      readonly id: string | null;
    }[];
    readonly selectedTreeIds: readonly string[];
  };
};
type Bounds = {
  readonly bottom: number;
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly width: number;
};
type WorkspaceGeometry = {
  readonly graph: Bounds;
  readonly main: Bounds;
  readonly overlay: Bounds | null;
  readonly sidebar: Bounds | null;
  readonly viewport: { readonly height: number; readonly width: number };
  readonly workspaceContent: Bounds;
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
    context = await browser.newContext({
      hasTouch: scenario.hasTouch ?? false,
      viewport: { width: 1440, height: 1000 },
    });
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
  await openRepositorySourceDialogAsync(page);
  await closeRepositoryPickerAsync(page);
  const saveAs = page.getByRole('button', { name: 'Save as', exact: true });
  if (!(await saveAs.isVisible())) await workspaceButton(page).click();
  await saveAs.waitFor();
}

/*** Opens the one visible picker, entering the mobile source dialog before its shared controls. */
async function openRepositoryPickerAsync(
  page: Page,
  repositoryLabel = 'owner-a/catalog'
): Promise<void> {
  const repository = page.getByRole('checkbox', { name: repositoryLabel });
  if (!(await repository.isVisible())) {
    await openRepositorySourceDialogAsync(page);
    const picker = repositoryPickerButton(page);
    if (!(await repository.isVisible())) await picker.click();
  }
  await repository.waitFor();
}

/*** Selects the live repository-picker trigger by its complete accessible button name. */
function repositoryPickerButton(page: Page): Locator {
  return page.getByRole('button', { name: /^Repositories \(\d+\/\d+\)$/, exact: true });
}

/*** Selects the saved-workspace trigger by its complete accessible button name. */
function workspaceButton(page: Page): Locator {
  return page.getByRole('button', { name: 'Workspace', exact: true });
}

/*** Opens the compact mobile dialog, while desktop exposes the same controls in the app header. */
async function openRepositorySourceDialogAsync(page: Page): Promise<void> {
  const dialog = page.getByText('Repository source', { exact: true });
  if (await dialog.isVisible()) return;
  const entry = page.getByLabel('Open repository source and workspace');
  if (await entry.isVisible()) {
    await entry.click();
    await dialog.waitFor();
    return;
  }
  await page.getByLabel('GitHub owner').waitFor();
}

/*** Closes the picker and then its mobile dialog so subsequent controls are no longer obscured. */
async function closeMobileRepositorySourceDialogAsync(page: Page): Promise<void> {
  await closeRepositoryPickerAsync(page);
  await page.keyboard.press('Escape');
  await page.getByText('Repository source', { exact: true }).waitFor({ state: 'hidden' });
}

/*** Closes the repository picker before targeting controls in its source dialog. */
async function closeRepositoryPickerAsync(page: Page): Promise<void> {
  const search = page.getByPlaceholder('Search repositories');
  if (await search.isVisible()) {
    await page.keyboard.press('Escape');
    await search.waitFor({ state: 'hidden' });
  }
}

/*** Verifies the separate canvas has a rendered area without treating a canvas label as DOM text. */
async function assertGraphCanvasAsync(page: Page): Promise<void> {
  const graph = page.getByRole('application', { name: 'Graph' });
  await graph.waitFor();
  const box = await graph.boundingBox();
  assert(box !== null && box.width > 0 && box.height > 0, 'Graph canvas has no rendered area.');
}

/*** Verifies the production workspace shell contains the resolved WorkspaceGraph at the requested viewport. */
async function assertWorkspaceGraphShellAsync(
  page: Page,
  viewport: { readonly height: number; readonly width: number }
): Promise<void> {
  const geometry = await captureWorkspaceGeometryAsync(page);
  assertDimensionsEqual(
    geometry.viewport,
    viewport,
    'WorkspaceGraph changed the browser viewport.'
  );
  assertBoundsContained(
    geometry.graph,
    geometry.workspaceContent,
    'WorkspaceGraph escaped the workspace content region.'
  );
}

/*** Verifies the rendered thumb position used by the installed ZORA switch when accessibility state is unavailable. */
async function assertSwitchCheckedAsync(switchControl: Locator, message: string): Promise<void> {
  assert(await isSwitchCheckedAsync(switchControl), message);
}

/*** Reads the ZORA switch state across its semantic and visual renderings. */
async function isSwitchCheckedAsync(switchControl: Locator): Promise<boolean> {
  if ((await switchControl.getAttribute('aria-checked')) === 'true') return true;
  return switchControl.evaluate(element =>
    [...element.querySelectorAll<HTMLElement>('*')].some(
      child => getComputedStyle(child).alignSelf === 'flex-end'
    )
  );
}

/*** Fails with a concrete diagnostic instead of accepting a missing user-visible state. */
function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/*** Read event-owned request cardinality after the browser has processed an interaction. */
function getRequestCount(requests: readonly Request[]): number {
  return requests.length;
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

/*** Verifies the production workspace fit against its desktop sidebar or mobile graph-first shell. */
async function assertWorkspaceViewportAsync(
  page: Page,
  repositoryCount: number,
  viewport: { readonly height: number; readonly width: number }
) {
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
    if (measurement === undefined || measurement === null || graph === null) return null;
    const canvas = graph.getBoundingClientRect();
    const nodes = measurement.nodes.map(node => ({
      x1: node.position.x - node.size.width / 2,
      x2: node.position.x + node.size.width / 2,
      y1: node.position.y - node.size.height / 2,
      y2: node.position.y + node.size.height / 2,
    }));
    return {
      canvas,
      sidebar: sidebar === null || sidebar === undefined ? null : sidebar.getBoundingClientRect(),
      viewport: measurement.viewport,
      x1: Math.min(...nodes.map(node => node.x1)),
      x2: Math.max(...nodes.map(node => node.x2)),
      y1: Math.min(...nodes.map(node => node.y1)),
      y2: Math.max(...nodes.map(node => node.y2)),
    };
  }, nodeIds);
  assert(result !== null, 'Real workspace canvas was unavailable.');
  if (viewport.width <= 768)
    assert(result.sidebar === null, 'Mobile workspace left the desktop sidebar mounted.');
  else {
    assert(result.sidebar !== null, 'Desktop workspace sidebar was unavailable.');
    assert(
      result.sidebar.width === referenceDesktopSidebarWidth,
      'Workspace sidebar is not visibly occupying its owned width.'
    );
  }
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
      await openRepositorySourceDialogAsync(page);
      const source = page.getByLabel('GitHub owner');
      await source.fill('@');
      await source.fill('@!');
      assert(
        (await source.inputValue()) === '@',
        'The owner input accepted an invalid special character.'
      );
      await page.getByLabel('GitHub owner').fill('owner-delayed');
      await page.getByLabel('GitHub owner').fill('owner-empty');
      await repositoryPickerButton(page).click();
      await page.getByText('No repositories match this search.').waitFor();
      await repositoryPickerButton(page).click();
      await page.getByLabel('GitHub owner').fill('owner-a');
      await repositoryPickerButton(page).waitFor();
      assert(
        !(await page.getByRole('checkbox', { name: 'Public only' }).isChecked()),
        'Public only must remain unchecked until explicitly selected.'
      );
      const publicOnly = page.getByRole('checkbox', { name: 'Public only' });
      await publicOnly.click();
      await waitForCheckboxStateAsync(page, 'Public only', true);
      assert(await publicOnly.isChecked(), 'Public only did not become checked after selection.');
      await publicOnly.press('Space');
      await waitForCheckboxStateAsync(page, 'Public only', false);
      assert(!(await publicOnly.isChecked()), 'Public only remained checked after deselection.');
      await repositoryPickerButton(page).click();
      await page.getByRole('checkbox', { name: 'owner-a/catalog' }).click();
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
      assert(
        (await page.getByTestId('workspace-breadcrumbs').innerText()).includes('catalog'),
        'The workspace header did not replace the repository-selection prompt after loading.'
      );
      await assertGraphCanvasAsync(page);
      await openRepositoryPickerAsync(page);
      await waitForCheckboxStateAsync(page, 'owner-a/catalog', true);
      assert(
        await page.getByRole('checkbox', { name: 'owner-a/catalog' }).isChecked(),
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
      await openRepositorySourceDialogAsync(page);
      const picker = repositoryPickerButton(page);
      await assertTopmostControlAsync(picker, 'Repository picker');
      assert(
        await picker.isDisabled(),
        'Multi-owner picker was not bounded to the server contract.'
      );
      assert(
        (await page
          .getByText('Repository selection is available for one GitHub owner or @me.', {
            exact: false,
          })
          .count()) === 0,
        'The desktop header rendered its long source-status notice inline.'
      );
      await page.getByText('owner-a', { exact: true }).waitFor();
      await page.getByText('owner-b', { exact: true }).waitFor();
      return [];
    }
  ),
  scenario(
    'source-picker-preserves-87-repository-topology',
    'Keeps retained repositories continuously available without refetching or re-analyzing them when one filtered repository is removed.',
    async page => {
      const repositoryIds = Array.from({ length: 87 }, (_, index) => `viewport-87-${index}`);
      const removedNodeId = 'repository.viewport-87-0';
      const retainedNodeIds = repositoryIds.slice(1).map(id => `repository.${id}`);
      const retainedLeafNodeIds = retainedNodeIds.map(id => `${id}.src`);
      const allNodeIds = [removedNodeId, ...retainedNodeIds];
      await openWorkspaceAsync(page, 'viewport-87', repositoryIds);
      await waitForGraphNodesAsync(page, retainedNodeIds);
      await panAndZoomGraphAsync(page);
      await page.evaluate(
        ({ parentNodeIds, leafNodeIds }) => {
          const target = window as typeof window & {
            __atlasTopologyAcceptance?: {
              readonly controller: GraphViewportProbe['controller'];
              readonly graph: Element | null;
              readonly layoutCount: number;
              readonly viewport: ReturnType<
                NonNullable<GraphViewportProbe['controller']>['getViewport']
              >;
              readonly positions: readonly {
                readonly id: string;
                readonly x: number;
                readonly y: number;
              }[];
              readonly parentMeasurements: readonly GraphCoordinate[];
              readonly sourceLeafMeasurementCount: number;
              readonly allPositions: readonly {
                readonly id: string;
                readonly x: number;
                readonly y: number;
              }[];
            };
            __atlasViewportProbe?: GraphViewportProbe;
          };
          const controller = target.__atlasViewportProbe?.controller;
          const measurement = controller?.measureNodes?.(parentNodeIds);
          const allMeasurement = controller?.measureNodes?.(
            Array.from({ length: 87 }, (_, index) => `repository.viewport-87-${index}`)
          );
          const leafMeasurement = controller?.measureNodes?.(leafNodeIds);
          if (
            controller === null ||
            controller === undefined ||
            measurement === null ||
            measurement === undefined ||
            allMeasurement === null ||
            allMeasurement === undefined ||
            allMeasurement.nodes.length !== 87
          )
            throw new Error('Graph controller did not expose the retained-node measurements.');
          target.__atlasTopologyAcceptance = {
            controller,
            graph: document.querySelector('[role="application"][aria-label="Graph"]'),
            layoutCount: target.__atlasViewportProbe?.layoutCount ?? 0,
            positions: measurement.nodes.map(node => ({
              id: node.id,
              x: node.position.x,
              y: node.position.y,
            })),
            parentMeasurements: measurement.nodes,
            sourceLeafMeasurementCount: leafMeasurement?.nodes.length ?? 0,
            allPositions: allMeasurement.nodes.map(node => ({
              id: node.id,
              x: node.position.x,
              y: node.position.y,
            })),
            viewport: controller.getViewport(),
          };
        },
        { leafNodeIds: retainedLeafNodeIds, parentNodeIds: retainedNodeIds }
      );
      const selectionRequests: Request[] = [];
      page.on('request', request => {
        if (request.url().endsWith('/api/workspace/selection')) selectionRequests.push(request);
      });
      await page.evaluate(nodeIds => {
        const target = window as typeof window & {
          __atlasRetainedNodeAvailability?: {
            readonly samples: string[][];
            stop: boolean;
          };
          __atlasViewportProbe?: GraphViewportProbe;
        };
        const availability = { samples: [] as string[][], stop: false };
        target.__atlasRetainedNodeAvailability = availability;
        const capture = () => {
          const nodes = target.__atlasViewportProbe?.controller?.measureNodes?.(nodeIds)?.nodes;
          availability.samples.push(nodes?.map(node => node.id) ?? []);
          if (!availability.stop) requestAnimationFrame(capture);
        };
        requestAnimationFrame(capture);
      }, retainedNodeIds);
      await openRepositorySourceDialogAsync(page);
      await repositoryPickerButton(page).click();
      await page.getByLabel('Search repositories').fill('akon taxi');
      const removedRepositoryCheckbox = page.getByRole('checkbox', {
        name: 'viewport/akon taxi',
      });
      await removedRepositoryCheckbox.waitFor();
      assert(
        getRequestCount(selectionRequests) === 0,
        'Searching repositories sent a selection request.'
      );
      const searchStability = await page.evaluate(() => {
        const target = window as typeof window & {
          __atlasTopologyAcceptance?: {
            readonly controller: GraphViewportProbe['controller'];
            readonly graph: Element | null;
            readonly allPositions: readonly {
              readonly id: string;
              readonly x: number;
              readonly y: number;
            }[];
            readonly layoutCount: number;
            readonly viewport: ReturnType<
              NonNullable<GraphViewportProbe['controller']>['getViewport']
            >;
          };
          __atlasViewportProbe?: GraphViewportProbe;
        };
        const baseline = target.__atlasTopologyAcceptance;
        const controller = target.__atlasViewportProbe?.controller;
        return {
          controllerRetained: baseline?.controller === controller,
          graphRetained:
            baseline?.graph === document.querySelector('[role="application"][aria-label="Graph"]'),
          layoutCount: target.__atlasViewportProbe?.layoutCount,
          positions: controller
            ?.measureNodes?.(baseline?.allPositions.map(node => node.id) ?? [])
            ?.nodes.map(node => ({ id: node.id, x: node.position.x, y: node.position.y })),
          previousLayoutCount: baseline?.layoutCount,
          previousPositions: baseline?.allPositions,
          previousViewport: baseline?.viewport,
          viewport: controller?.getViewport(),
        };
      });
      assert(
        searchStability.controllerRetained,
        'Repository search remounted the GraphView controller.'
      );
      assert(searchStability.graphRetained, 'Repository search remounted the graph canvas.');
      assert(
        searchStability.layoutCount === searchStability.previousLayoutCount,
        'Repository search ran a graph layout.'
      );
      assert(
        JSON.stringify(searchStability.viewport) ===
          JSON.stringify(searchStability.previousViewport),
        'Repository search changed the user viewport.'
      );
      assert(
        JSON.stringify(searchStability.positions) ===
          JSON.stringify(searchStability.previousPositions),
        'Repository search changed graph geometry.'
      );
      const removalRequest = page.waitForRequest(request => {
        if (!request.url().endsWith('/api/workspace/selection') || request.method() !== 'POST')
          return false;
        const body = JSON.parse(request.postData() ?? '{}') as {
          readonly addedRepositoryIds?: unknown;
          readonly removedRepositoryIds?: unknown;
          readonly runtimeId?: unknown;
        };
        return (
          Array.isArray(body.addedRepositoryIds) &&
          body.addedRepositoryIds.length === 0 &&
          Array.isArray(body.removedRepositoryIds) &&
          body.removedRepositoryIds.length === 1 &&
          body.removedRepositoryIds[0] === 'viewport-87-0' &&
          typeof body.runtimeId === 'string'
        );
      });
      const removalResponse = page.waitForResponse(
        response => response.url().endsWith('/api/workspace/selection') && response.status() === 200
      );
      await removedRepositoryCheckbox.click();
      await removalRequest;
      await removalResponse;
      await page.waitForFunction(ids => {
        const probe = (window as typeof window & { __atlasViewportProbe?: GraphViewportProbe })
          .__atlasViewportProbe;
        const measurement = probe?.controller?.measureNodes?.(ids);
        return (
          measurement?.nodes.length === ids.length - 1 &&
          !measurement.nodes.some(node => node.id === ids[0])
        );
      }, allNodeIds);
      assert(
        !(await removedRepositoryCheckbox.isChecked()),
        'Repository picker did not commit the removal.'
      );
      assert(
        getRequestCount(selectionRequests) === 1,
        `Expected one removal request, observed ${getRequestCount(selectionRequests)}.`
      );
      const stability = await page.evaluate(() => {
        const target = window as typeof window & {
          __atlasTopologyAcceptance?: {
            readonly controller: GraphViewportProbe['controller'];
            readonly graph: Element | null;
            readonly layoutCount: number;
            readonly viewport: ReturnType<
              NonNullable<GraphViewportProbe['controller']>['getViewport']
            >;
            readonly positions: readonly {
              readonly id: string;
              readonly x: number;
              readonly y: number;
            }[];
            readonly parentMeasurements: readonly GraphCoordinate[];
            readonly sourceLeafMeasurementCount: number;
            readonly allPositions: readonly {
              readonly id: string;
              readonly x: number;
              readonly y: number;
            }[];
          };
          __atlasViewportProbe?: GraphViewportProbe;
        };
        const baseline = target.__atlasTopologyAcceptance;
        const controller = target.__atlasViewportProbe?.controller;
        const measurement = controller?.measureNodes?.(
          baseline?.positions.map(node => node.id) ?? []
        );
        const allMeasurement = controller?.measureNodes?.([
          'repository.viewport-87-0',
          ...Array.from({ length: 86 }, (_, index) => `repository.viewport-87-${index + 1}`),
        ]);
        return {
          controllerRetained: baseline?.controller === controller,
          graphRetained:
            baseline?.graph === document.querySelector('[role="application"][aria-label="Graph"]'),
          layoutCount: target.__atlasViewportProbe?.layoutCount,
          measurement,
          allMeasurement,
          previousLayoutCount: baseline?.layoutCount,
          previousParentMeasurements: baseline?.parentMeasurements,
          sourceLeafMeasurementCount: baseline?.sourceLeafMeasurementCount,
          previousPositions: baseline?.positions,
          previousViewport: baseline?.viewport,
          viewport: controller?.getViewport(),
        };
      });
      assert(
        stability.controllerRetained,
        'Repository removal remounted the GraphView controller.'
      );
      assert(stability.graphRetained, 'Repository removal remounted the graph canvas.');
      assert(
        stability.allMeasurement?.nodes.length === 86 &&
          !stability.allMeasurement.nodes.some(node => node.id === removedNodeId),
        'Repository removal did not commit an exact 87 to 86 graph-node transition.'
      );
      const availability = await page.evaluate(() => {
        const target = window as typeof window & {
          __atlasRetainedNodeAvailability?: {
            readonly samples: readonly string[][];
            stop: boolean;
          };
        };
        const result = target.__atlasRetainedNodeAvailability;
        if (result !== undefined) result.stop = true;
        return result?.samples ?? [];
      });
      assert(availability.length > 0, 'No retained-node availability samples were captured.');
      assert(
        availability.every(
          ids =>
            ids.length === retainedNodeIds.length && retainedNodeIds.every(id => ids.includes(id))
        ),
        'Repository removal temporarily removed retained repository nodes from the existing graph.'
      );
      return [];
    }
  ),
  scenario(
    'source-picker-immediate-selection',
    'Applies a selection diff immediately without a deferred source action or document navigation.',
    async page => {
      await openWorkspaceAsync(page, 'owner-a', ['owner-a-catalog', 'owner-a-shared']);
      await openRepositorySourceDialogAsync(page);
      const before = page.url();
      await repositoryPickerButton(page).click();
      await page.getByRole('checkbox', { name: 'owner-a/catalog' }).click();
      await page.waitForURL(
        openedUrl =>
          openedUrl.searchParams.get('source') === 'owner-a' &&
          openedUrl.searchParams.get('repositories') === 'owner-a-shared'
      );
      await closeMobileRepositorySourceDialogAsync(page);
      assert(page.url() !== before, 'Selection did not update browser history.');
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
        !(await page.getByRole('checkbox', { name: 'owner-a/catalog' }).isChecked()),
        'Excluded repository was selected after the immediate selection update.'
      );
      return [];
    }
  ),
  scenario(
    'source-picker-repository-color',
    'Edits and resets one repository color without changing repository selection, graph geometry, or requests.',
    async page => {
      await openWorkspaceAsync(page, 'owner-a', ['owner-a-catalog', 'owner-a-shared']);
      await openRepositoryPickerAsync(page);
      const repository = page.getByRole('checkbox', { name: 'owner-a/catalog' });
      assert(await repository.isChecked(), 'Repository was not selected before editing its color.');
      const before = await readGraphPresentationAsync(page);
      const requests: string[] = [];
      page.on('request', request => requests.push(request.url()));
      await page.getByLabel('Change color for owner-a/catalog').click();
      const picker = page.getByTestId('repository-color-picker-owner-a-catalog');
      await picker.getByRole('slider', { name: /Color wheel/u }).waitFor();
      assert(
        (await picker.getByRole('tab').count()) === 2,
        'Repository color picker did not expose exactly Wheel and Tone.'
      );
      assert(
        (await picker.getByRole('button', { name: 'None' }).count()) === 0,
        'Repository color picker exposed Harmony controls.'
      );
      await picker.getByRole('tab', { name: 'tone' }).click();
      await picker.getByLabel('jewel').first().click();
      await page.waitForFunction(() =>
        Object.entries(localStorage).some(
          ([key, value]) =>
            key.endsWith('.repository-colors') &&
            /^#[0-9A-F]{6}$/u.test(
              (JSON.parse(value) as Record<string, unknown>)['owner-a-catalog'] as string
            )
        )
      );
      assert(
        (await picker.getByLabel(/Selected jewel color 1:/u).count()) === 1,
        'Tone picker did not retain exactly one selected color.'
      );
      await settleGraphPresentationAsync(page);
      const afterColor = await readGraphPresentationAsync(page);
      assert(
        afterColor.layoutCount === 1,
        `Repository color update recomputed graph layout: expected 1, received ${afterColor.layoutCount}.`
      );
      // The source dialog correctly blocks background header actions while open.
      await page.keyboard.press('Escape');
      await picker.waitFor({ state: 'hidden' });
      await closeMobileRepositorySourceDialogAsync(page);
      await toggleThemeAsync(page);
      await settleGraphPresentationAsync(page);
      const afterThemeChange = await readGraphPresentationAsync(page);
      assert(
        afterThemeChange.layoutCount === 1,
        `Repository color theme switch recomputed graph layout: expected 1, received ${afterThemeChange.layoutCount}.`
      );
      await openRepositoryPickerAsync(page);
      await page.getByLabel('Change color for owner-a/catalog').click();
      await page.getByRole('button', { name: 'Reset color' }).click();
      await page.waitForFunction(() =>
        Object.entries(localStorage).every(
          ([key, value]) =>
            !key.endsWith('.repository-colors') ||
            !Object.hasOwn(JSON.parse(value) as Record<string, unknown>, 'owner-a-catalog')
        )
      );
      const after = await readGraphPresentationAsync(page);
      assert(
        await repository.isChecked(),
        'Color swatch interaction changed repository selection.'
      );
      assert(
        before.layoutCount === after.layoutCount,
        `Repository color interaction recomputed graph layout: ${before.layoutCount} -> ${after.layoutCount}.`
      );
      assert(
        JSON.stringify(before.viewport) === JSON.stringify(after.viewport),
        'Repository color interaction changed the graph viewport.'
      );
      assert(
        requests.every(request => !request.includes('/api/workspace/selection')),
        `Repository color interaction issued a selection request: ${requests.join(', ')}`
      );
      assert(
        requests.every(request => !request.includes('github')),
        `Repository color interaction issued a GitHub request: ${requests.join(', ')}`
      );
      return [];
    }
  ),
  scenario(
    'source-picker-runtime-recovery',
    'Recovers a current single-owner selection after the server evicts its incremental runtime.',
    async page => {
      await openWorkspaceAsync(page, 'owner-recovery', ['owner-a-catalog', 'owner-a-shared']);
      await openRepositorySourceDialogAsync(page);
      const recoveryRequest = page.waitForRequest(request => {
        if (!request.url().endsWith('/api/workspace/selection') || request.method() !== 'POST')
          return false;
        const body = JSON.parse(request.postData() ?? '{}') as { readonly runtimeId?: unknown };
        return body.runtimeId === undefined;
      });
      await repositoryPickerButton(page).click();
      await page.getByRole('checkbox', { name: 'owner-a/catalog' }).click();
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
      await openRepositorySourceDialogAsync(page);
      const firstRequest = page.waitForRequest(
        request => request.url().endsWith('/api/workspace/selection') && request.method() === 'POST'
      );
      await repositoryPickerButton(page).click();
      await page.getByRole('checkbox', { name: 'owner-a/catalog' }).click();
      await firstRequest;
      const secondRequest = page.waitForRequest(
        request => request.url().endsWith('/api/workspace/selection') && request.method() === 'POST'
      );
      await openRepositoryPickerAsync(page);
      await page.getByRole('checkbox', { name: 'owner-a/catalog' }).click();
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
      await openRepositorySourceDialogAsync(page);
      assert(
        await repositoryPickerButton(page).isDisabled(),
        'Overlapping owners were exposed to the single-owner picker.'
      );
      await closeMobileRepositorySourceDialogAsync(page);
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
      await openRepositorySourceDialogAsync(page);
      const picker = repositoryPickerButton(page);
      assert(
        await picker.isDisabled(),
        'Multi-owner exclusions were exposed to incremental selection.'
      );
      await picker.getByText('Repositories (4/5)', { exact: true }).waitFor();
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
    'Synchronizes TreeView selection with the workspace graph selection without changing the viewport.',
    async page => {
      await openWorkspaceAsync(page);
      const zoom = await page.getByLabel('Zoom').inputValue();
      await page.getByRole('button', { name: 'Expand' }).first().click();
      await page.getByText('catalog', { exact: true }).click();
      assert(
        (await page.getByText('catalog', { exact: true }).count()) > 0,
        'Tree selection was unavailable.'
      );
      assert(
        (await page.getByLabel('Zoom').inputValue()) === zoom,
        'Tree selection changed the settled viewport.'
      );
      return [];
    }
  ),
  scenario(
    'multi-repository-real-source-compounds',
    'Navigates a real source hierarchy without synthetic module groups while compounds are both enabled and disabled.',
    async page => {
      const catalogRoot = 'repository.owner-a-catalog';
      const catalogSource = `${catalogRoot}.src`;
      const sharedSource = 'repository.owner-a-shared.src';
      await openWorkspaceAsync(page);
      await page.getByLabel('Subpackage depth').fill('3');
      await waitForGraphNodesAsync(page, [catalogRoot, catalogSource, sharedSource]);
      const graph = page.getByRole('application', { name: 'Graph' });
      const graphBounds = await graph.boundingBox();
      assert(graphBounds !== null, 'Graph canvas has no bounds for source navigation.');
      await doublePressGraphNodeAsync(page, catalogRoot, graphBounds);
      await waitForGraphNodesAsync(page, [catalogSource, sharedSource]);
      const breadcrumbs = await page.getByTestId('workspace-breadcrumbs').innerText();
      assert(
        !breadcrumbs.includes('module'),
        `Breadcrumb navigation exposed a synthetic module segment: ${breadcrumbs}.`
      );
      await assertNoSyntheticModuleNodeAsync(page, catalogRoot);
      const compound = page.getByLabel('Show Compound Nodes');
      if (await isSwitchCheckedAsync(compound)) await compound.click();
      await waitForGraphNodesAsync(page, [catalogSource, sharedSource]);
      await assertNoSyntheticModuleNodeAsync(page, catalogRoot);
      if (!(await isSwitchCheckedAsync(compound))) await compound.click();
      await waitForGraphNodesAsync(page, [catalogSource, sharedSource]);
      await assertNoSyntheticModuleNodeAsync(page, catalogRoot);
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
      await page.getByLabel('Home').click();
      await page.getByText('Atlas', { exact: true }).waitFor();
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
      await openWorkspaceMenuAsync(page);
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
      await openRepositorySourceDialogAsync(page);
      await repositoryPickerButton(page).click();
      await page.getByRole('checkbox', { name: 'owner-a/catalog' }).click();
      await closeMobileRepositorySourceDialogAsync(page);
      const vendor = page.getByRole('switch', { name: 'Show Vendor' });
      if (!(await isSwitchCheckedAsync(vendor))) await vendor.click();
      await assertSwitchCheckedAsync(vendor, 'Vendor setting did not change before Save.');
      await openWorkspaceMenuAsync(page);
      page.once('dialog', dialog => dialog.accept('Restored workspace'));
      await page.getByRole('button', { name: 'Save as' }).click();
      await page.waitForURL(/workspace=restored-workspace/u);
      await page.evaluate(() => window.localStorage.removeItem('showVendorPackages'));
      await page.reload({ waitUntil: 'networkidle' });
      const restoredVendor = page.getByRole('switch', { name: 'Show Vendor' });
      await assertSwitchCheckedAsync(restoredVendor, 'Saved vendor setting was not restored.');
      await page.getByRole('application', { name: 'Graph' }).waitFor();
      await openRepositorySourceDialogAsync(page);
      await repositoryPickerButton(page).click();
      await waitForCheckboxStateAsync(page, 'owner-a/catalog', false);
      await waitForCheckboxStateAsync(page, 'owner-a/shared', true);
      assert(
        !(await page.getByRole('checkbox', { name: 'owner-a/catalog' }).isChecked()),
        'Saved exclusion was not restored.'
      );
      assert(
        await page.getByRole('checkbox', { name: 'owner-a/shared' }).isChecked(),
        'Saved repository selection was not restored.'
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
      await openRepositorySourceDialogAsync(page);
      await repositoryPickerButton(page).click();
      await page.getByRole('checkbox', { name: 'owner-a/catalog' }).click();
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
      await openRepositorySourceDialogAsync(page);
      assert(
        (await page.getByLabel('GitHub owner').inputValue()) === 'owner-a',
        'Owner was not restored after the auth redirect.'
      );
      await repositoryPickerButton(page).click();
      assert(
        !(await page.getByRole('checkbox', { name: 'owner-a/catalog' }).isChecked()),
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
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await page.getByRole('button', { name: 'Switch to light mode' }).waitFor();
    return [];
  }),
  scenario(
    'responsive-header',
    'Keeps the compact header actions visible and operable on a mobile viewport.',
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
        'Header actions do not retain their responsive layout policy.'
      );
      await assertTopmostControlAsync(
        page.getByRole('button', { name: 'Switch to dark mode' }),
        'Theme control'
      );
      await page.getByRole('button', { name: 'Switch to dark mode' }).click();
      await page.getByRole('button', { name: 'Switch to light mode' }).waitFor();
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
        if (viewport.width <= 768) {
          await page.getByRole('button', { name: 'Tools' }).click();
          await page.getByText('Workspace tools', { exact: true }).waitFor();
        }
        await page
          .getByTestId('cytoscape-layout-trigger')
          .getByText('Elk: Layered', { exact: true })
          .waitFor();
        if (viewport.width <= 768) await closeWorkspaceToolsDialogAsync(page);
        await assertWorkspaceViewportAsync(page, repositoryCount, viewport);
        await assertWorkspaceGraphShellAsync(page, viewport);
        const artifact = `workspace-elk-${repositoryCount}-${viewport.width}.png`;
        await page.screenshot({ path: resolve(evidenceDirectory, artifact), fullPage: true });
        artifacts.push(artifact);
      }
      return artifacts;
    }
  ),
  scenario(
    'anonymous-bulk-progress-viewport',
    'Keeps the anonymous 87-repository progress hint visible without resizing the sidebar or canvas.',
    async page => {
      const artifacts: string[] = [];
      for (const [viewport, theme] of [
        [{ width: 1440, height: 900 }, 'dark'],
        [{ width: 390, height: 844 }, 'light'],
      ] as const) {
        await page.setViewportSize(viewport);
        await page.goto(`${url}/?source=bulk-pending&repositories=bulk-pending-0`, {
          waitUntil: 'networkidle',
        });
        await page.getByRole('application', { name: 'Graph' }).waitFor();
        const beforeSelection = await captureWorkspaceGeometryAsync(page);
        await openRepositoryPickerAsync(page, 'bulk-pending/repository-0');
        await page.getByRole('button', { exact: true, name: 'Select all' }).click();
        await closeMobileRepositorySourceDialogAsync(page);
        const hint = page.getByText(
          'Sign in with GitHub to analyze many repositories with authenticated GitHub limits.'
        );
        await hint.waitFor();
        const duringProgress = await captureWorkspaceGeometryAsync(page);
        const screenshot = `anonymous-bulk-progress-${viewport.width}-${theme}.png`;
        await page.screenshot({ path: resolve(evidenceDirectory, screenshot), fullPage: true });
        artifacts.push(screenshot);
        await hint.waitFor({ state: 'hidden', timeout: 15_000 });
        const afterCompletion = await captureWorkspaceGeometryAsync(page);
        await toggleThemeAsync(page);
        const afterThemeChange = await captureWorkspaceGeometryAsync(page);
        const geometryArtifact = `anonymous-bulk-progress-${viewport.width}-${theme}.json`;
        await writeFile(
          resolve(evidenceDirectory, geometryArtifact),
          JSON.stringify(
            { afterCompletion, afterThemeChange, beforeSelection, duringProgress },
            null,
            2
          )
        );
        artifacts.push(geometryArtifact);
        assertAnonymousBulkWorkspaceGeometry(
          { afterCompletion, afterThemeChange, beforeSelection, duringProgress },
          viewport
        );
      }
      return artifacts;
    }
  ),
  scenario(
    'responsive-touch-acceptance-matrix',
    'Exercises the responsive workspace with native touch, pointer, and keyboard input in both themes.',
    async page => {
      const artifacts: string[] = [];
      for (const viewport of responsiveViewports)
        for (const theme of ['light', 'dark'] as const) {
          await page.setViewportSize(viewport);
          await page.goto(
            `${url}/?source=bulk-pending&repositories=${bulkSelectionIds.join(',')}`,
            { waitUntil: 'networkidle' }
          );
          await page.getByRole('application', { name: 'Graph' }).waitFor();
          await waitForWorkspaceLoadingCompleteAsync(page);
          await setThemeAsync(page, theme);
          const evidence = await captureResponsiveEvidenceAsync(page, viewport, theme);
          assertResponsiveEvidence(evidence, viewport, theme);
          const basename = `responsive-${viewport.width}x${viewport.height}-${theme}`;
          await page.screenshot({
            path: resolve(evidenceDirectory, `${basename}.png`),
            fullPage: true,
          });
          await writeFile(
            resolve(evidenceDirectory, `${basename}.json`),
            JSON.stringify(evidence, null, 2)
          );
          artifacts.push(`${basename}.png`, `${basename}.json`);
        }

      await page.setViewportSize(responsiveViewports[0]);
      await page.goto(`${url}/?source=bulk-pending&repositories=${bulkSelectionIds.join(',')}`, {
        waitUntil: 'networkidle',
      });
      await page.getByRole('application', { name: 'Graph' }).waitFor();
      await waitForWorkspaceLoadingCompleteAsync(page);
      await exerciseMobileInteractionContractAsync(page);
      return artifacts;
    },
    true
  ),
  scenario(
    'single-project-offline-parity',
    'Retains direct single-project browser behavior with no outbound requests.',
    async page => {
      await openWorkspaceAsync(page, encodeURIComponent('https://github.com/owner-a/catalog'));
      await page.getByText('Atlas', { exact: true }).waitFor();
      return [];
    }
  ),
];

/*** Names each independently reported browser workflow. */
function scenario(
  id: string,
  description: string,
  run: Scenario['run'],
  hasTouch = false
): Scenario {
  return { description, hasTouch, id, run };
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
const bulkSelectionIds = Array.from({ length: 7 }, (_, index) => `bulk-pending-${index}`);
const responsiveTouchGraphNodeIds = await resolveResponsiveTouchGraphNodeIdsAsync();
const responsiveViewports = [
  { height: 844, width: 390 },
  { height: 932, width: 430 },
  { height: 390, width: 844 },
  { height: 1024, width: 768 },
  { height: 900, width: 1440 },
] as const;

const referenceDesktopFramePadding = 24;
const referenceDesktopPanelMargin = 12;
const referenceDesktopSidebarWidth = 256;

/*** Captures the measured layout invariants rendered by Chromium for one responsive acceptance cell. */
async function captureResponsiveEvidenceAsync(
  page: Page,
  viewport: { readonly height: number; readonly width: number },
  theme: 'dark' | 'light'
) {
  const expectedThemeActionName = `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`;
  const themeAction = page.getByRole('button', { exact: true, name: expectedThemeActionName });
  await themeAction.waitFor();
  const evidence = await page.evaluate(() => {
    const bounds = (element: Element | null | undefined) => {
      if (element == null) return null;
      const { bottom, height, left, right, top, width } = element.getBoundingClientRect();
      return { bottom, height, left, right, top, width };
    };
    const header = document.querySelector('[data-testid="workspace-header"]');
    const graph = document.querySelector('[role="application"][aria-label="Graph"]');
    const sidebar = document.querySelector('[data-testid="sidebar-tree-scroll"]')?.closest('aside');
    const tools = [...document.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Tools')
    );
    const fit = [...document.querySelectorAll('button')].find(
      button =>
        button.getAttribute('aria-label') === 'Fit graph and optimize spacing for readability'
    );
    const zoom = document.querySelector('[aria-label="Zoom"]');
    const repositoryEntry = document.querySelector(
      '[aria-label="Open repository source and workspace"]'
    );
    const selected = document.querySelector('[role="application"][aria-label="Graph"]');
    return {
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      },
      graph: bounds(graph),
      header: bounds(header),
      repositoryEntry: bounds(repositoryEntry ?? null),
      sidebar: bounds(sidebar),
      tools: bounds(tools ?? null),
      fit: bounds(fit ?? null),
      viewport: { height: window.innerHeight, width: window.innerWidth },
      visibleGraph: selected !== null,
      zoom: bounds(zoom),
    };
  });
  return { ...evidence, themeAction: await themeAction.boundingBox() };
}

/*** Enforces the mobile graph-first and desktop split-pane geometry without relying on snapshots alone. */
function assertResponsiveEvidence(
  evidence: Awaited<ReturnType<typeof captureResponsiveEvidenceAsync>>,
  viewport: { readonly height: number; readonly width: number },
  theme: 'dark' | 'light'
) {
  assertDimensionsEqual(evidence.viewport, viewport, 'Responsive acceptance viewport drifted.');
  assert(
    evidence.document.scrollWidth <= evidence.document.clientWidth,
    `Responsive acceptance has horizontal document overflow: ${JSON.stringify(evidence.document)}`
  );
  assert(
    evidence.visibleGraph && evidence.graph !== null,
    'Responsive acceptance did not render a graph.'
  );
  assert(
    evidence.header !== null && evidence.header.height > 0,
    'Responsive acceptance has an empty header.'
  );
  assert(
    evidence.header.height < 180,
    `Responsive acceptance header is too tall: ${evidence.header.height}.`
  );
  assert(evidence.themeAction !== null, `Responsive acceptance did not apply the ${theme} theme.`);
  assert(
    evidence.repositoryEntry !== null,
    'Responsive acceptance does not show 7 of 87 repositories.'
  );
  if (viewport.width <= 768) {
    assert(
      evidence.sidebar === null,
      'Responsive acceptance leaves the desktop sidebar visible on mobile.'
    );
    assert(evidence.tools !== null, 'Responsive acceptance lacks the mobile Tools entry point.');
    assert(
      evidence.graph.left <= 1 && Math.abs(evidence.graph.width - viewport.width) <= 1,
      `Responsive graph does not occupy the allocated mobile width: ${JSON.stringify(evidence.graph)}.`
    );
    assert(
      evidence.tools.left >= 0 &&
        evidence.tools.top >= 0 &&
        evidence.tools.right <= viewport.width &&
        evidence.tools.bottom <= viewport.height,
      `Mobile Tools control escaped the viewport: ${JSON.stringify(evidence.tools)}`
    );
    assert(
      evidence.fit !== null && evidence.zoom !== null,
      'Mobile graph zoom controls are unavailable for pointer interaction.'
    );
    assertSeparatePointerTargets(
      evidence.tools,
      evidence.fit,
      'Tools overlaps the Fit graph control.'
    );
    assertSeparatePointerTargets(evidence.tools, evidence.zoom, 'Tools overlaps the Zoom control.');
  } else {
    assert(
      evidence.sidebar !== null && evidence.sidebar.width === referenceDesktopSidebarWidth,
      'Desktop sidebar changed width.'
    );
  }
}

/*** Rejects controls whose visible hit areas overlap, preventing ambiguous mobile pointer input. */
function assertSeparatePointerTargets(first: Bounds, second: Bounds, message: string): void {
  const overlaps =
    first.left < second.right &&
    first.right > second.left &&
    first.top < second.bottom &&
    first.bottom > second.top;
  assert(!overlaps, message);
}

/*** Waits for every intentionally delayed repository before sending native graph input. */
async function waitForWorkspaceLoadingCompleteAsync(page: Page): Promise<void> {
  await page
    .getByRole('status', { name: 'Repository loading status' })
    .waitFor({ state: 'hidden', timeout: 20_000 });
}

/*** Uses native Chromium input paths to prove source, overlay, graph, and keyboard interaction contracts. */
async function exerciseMobileInteractionContractAsync(page: Page): Promise<void> {
  const sourceEntry = page.getByLabel('Open repository source and workspace');
  const tools = page.getByRole('button', { name: 'Tools' });
  await exerciseNativeGraphInteractionContractAsync(page, tools);

  await sourceEntry.click();
  await page.getByText('Repository source', { exact: true }).waitFor();
  const repositoryPickers = repositoryPickerButton(page);
  assert(
    (await repositoryPickers.count()) === 1,
    'Repository source dialog did not expose its focused repository picker.'
  );
  await repositoryPickers.last().click();
  await waitForCheckboxStateAsync(page, 'bulk-pending/repository-0', true);
  assert(
    await page.getByRole('checkbox', { name: 'bulk-pending/repository-0' }).isChecked(),
    'Repository selection was not retained in the mobile dialog.'
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await sourceEntry.waitFor({ state: 'visible' });
  assert(
    await sourceEntry.evaluate(element => document.activeElement === element),
    'Repository dialog did not restore focus to its entry point.'
  );
  await sourceEntry.click();
  await page.getByLabel('Close repository source').click();
  await page.getByText('Repository source', { exact: true }).waitFor({ state: 'detached' });
  assert(
    await sourceEntry.evaluate(element => document.activeElement === element),
    'Repository dialog X did not restore focus to its entry point.'
  );
  await sourceEntry.click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByText('Repository source', { exact: true }).waitFor({ state: 'detached' });
  assert(
    await sourceEntry.evaluate(element => document.activeElement === element),
    'Repository dialog footer did not restore focus to its entry point.'
  );

  await tools.click();
  await page.getByText('Workspace tools', { exact: true }).waitFor();
  for (const name of ['Tree', 'Rules', 'Export'] as const) {
    const tab = page.getByRole('tab', { name });
    await tab.click();
    await tab.waitFor();
  }
  await closeWorkspaceToolsDialogAsync(page);
  assert(
    await tools.evaluate(element => document.activeElement === element),
    'Tools dialog did not restore focus to its entry point.'
  );
  await tools.click();
  await page.getByLabel('Close workspace tools').click();
  await page.getByText('Workspace tools', { exact: true }).waitFor({ state: 'detached' });
  assert(
    await tools.evaluate(element => document.activeElement === element),
    'Tools dialog X did not restore focus to its entry point.'
  );
  await tools.click();
  await page.getByRole('button', { exact: true, name: 'Close' }).click();
  await page.getByText('Workspace tools', { exact: true }).waitFor({ state: 'detached' });
  assert(
    await tools.evaluate(element => document.activeElement === element),
    'Tools dialog footer did not restore focus to its entry point.'
  );
}

/*** Exercises touch, pointer, and fit while the settled GraphView controller still owns the canvas. */
async function exerciseNativeGraphInteractionContractAsync(
  page: Page,
  tools: Locator
): Promise<void> {
  await waitForGraphNodesAsync(page, responsiveTouchGraphNodeIds);
  const graph = page.getByRole('application', { name: 'Graph' });
  const graphBox = await graph.boundingBox();
  assert(graphBox !== null, 'Graph has no bounds for native input acceptance.');
  const node = await readGraphNodeAsync(page, responsiveTouchGraphNodeIds);
  await page.touchscreen.tap(graphBox.x + node.position.x, graphBox.y + node.position.y);
  await assertGraphTouchSelectionAsync(page, tools);
  const before = await readGraphViewportAsync(page);
  const panPoint = await findGraphPanPointAsync(page, graphBox);
  await installGraphGestureProbeAsync(page);
  await page.mouse.move(graphBox.x + panPoint.x, graphBox.y + panPoint.y);
  await page.mouse.down();
  await page.mouse.move(graphBox.x + panPoint.x + 10, graphBox.y + panPoint.y + 7, { steps: 5 });
  await page.mouse.move(graphBox.x + panPoint.x + 30, graphBox.y + panPoint.y + 20, { steps: 10 });
  await page.mouse.up();
  const afterPointerPan = await readGraphViewportAsync(page);
  const gesture = await readGraphGestureProbeAsync(page);
  assert(
    gesture.mouseDownCount === 1 && gesture.mouseMoveCount > 1 && gesture.mouseUpCount === 1,
    `Cytoscape did not receive the native multi-step mouse gesture: ${JSON.stringify(gesture)}.`
  );
  assert(
    JSON.stringify(afterPointerPan.pan) !== JSON.stringify(before.pan),
    `Pointer pan did not change the graph viewport after Cytoscape received the gesture: ${JSON.stringify(gesture)}.`
  );
  await pinchGraphAsync(page, graphBox);
  const afterPinch = await readGraphViewportAsync(page);
  assert(afterPinch.zoom > afterPointerPan.zoom, 'Native touch pinch did not zoom the graph.');
  await page.getByLabel('Fit graph and optimize spacing for readability').click();
  const afterFit = await readGraphViewportAsync(page);
  assert(afterFit.zoom !== afterPinch.zoom, 'Fit did not update the graph viewport.');
}

/*** Waits for ZORA's public checkbox ARIA state before asserting its checked value. */
async function waitForCheckboxStateAsync(
  page: Page,
  accessibilityLabel: string,
  checked: boolean
): Promise<void> {
  await page.waitForFunction(
    ({ accessibilityLabel: label, checked: expectedChecked }) =>
      [...document.querySelectorAll('[role="checkbox"]')].some(
        checkbox =>
          checkbox.getAttribute('aria-label') === label &&
          checkbox.getAttribute('aria-checked') === String(expectedChecked)
      ),
    { accessibilityLabel, checked }
  );
}

/*** Closes the mobile tools dialog only after its portal unmounts and focus cleanup can complete.
 */
async function closeWorkspaceToolsDialogAsync(page: Page): Promise<void> {
  const title = page.getByText('Workspace tools', { exact: true });
  await page.keyboard.press('Escape');
  await title.waitFor({ state: 'detached' });
}

/*** Reads the released GraphView controller rather than its private renderer for interaction assertions. */
async function readGraphViewportAsync(page: Page) {
  const viewport = await page.evaluate(() => {
    const probe = (window as typeof window & { __atlasViewportProbe?: GraphViewportProbe })
      .__atlasViewportProbe;
    return probe?.controller?.getViewport() ?? null;
  });
  assert(viewport !== null, 'Graph controller was unavailable for interaction acceptance.');
  return viewport;
}

/*** Capture public graph presentation state to reject color edits that re-layout or auto-fit. */
async function readGraphPresentationAsync(page: Page) {
  const presentation = await page.evaluate(() => {
    const probe = (window as typeof window & { __atlasViewportProbe?: GraphViewportProbe })
      .__atlasViewportProbe;
    return probe?.controller === null || probe?.controller === undefined
      ? null
      : { layoutCount: probe.layoutCount, viewport: probe.controller.getViewport() };
  });
  assert(presentation !== null, 'Graph presentation probe was unavailable.');
  return presentation;
}

/*** Allows the public GraphView runtime to reconcile paint before reading its lifecycle counter. */
async function settleGraphPresentationAsync(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
}

/*** Establishes a user-owned viewport baseline through native graph and control input. */
async function panAndZoomGraphAsync(page: Page): Promise<void> {
  const graph = page.getByRole('application', { name: 'Graph' });
  const graphBox = await graph.boundingBox();
  assert(graphBox !== null, 'Graph has no bounds for a native viewport baseline.');
  const beforePan = await readGraphViewportAsync(page);
  const panPoint = await findGraphPanPointAsync(page, graphBox);
  await page.mouse.move(graphBox.x + panPoint.x, graphBox.y + panPoint.y);
  await page.mouse.down();
  await page.mouse.move(graphBox.x + panPoint.x + 30, graphBox.y + panPoint.y + 20, { steps: 8 });
  await page.mouse.up();
  const afterPan = await readGraphViewportAsync(page);
  assert(
    JSON.stringify(afterPan.pan) !== JSON.stringify(beforePan.pan),
    'Native graph pan did not change the viewport.'
  );
  const zoom = page.getByLabel('Zoom');
  const previousZoom = await zoom.inputValue();
  await zoom.focus();
  await page.keyboard.press('ArrowRight');
  assert(
    (await zoom.inputValue()) !== previousZoom,
    'Native zoom control did not change the viewport.'
  );
}

/*** Finds an uncovered Cytoscape background point so native mouse input cannot be captured by a graph overlay. */
async function findGraphPanPointAsync(
  page: Page,
  graph: { readonly height: number; readonly width: number; readonly x: number; readonly y: number }
) {
  const point = await page.evaluate(graph => {
    const application = document.querySelector<HTMLElement>(
      '[role="application"][aria-label="Graph"]'
    );
    const cytoscapeContainer = application?.querySelector('canvas')?.parentElement;
    if (cytoscapeContainer === null || cytoscapeContainer === undefined)
      return { candidates: [], point: null };
    const candidates = [
      { x: 24, y: 24 },
      { x: graph.width - 24, y: 24 },
      { x: 24, y: graph.height - 24 },
      { x: graph.width - 24, y: graph.height - 24 },
    ];
    const candidatesWithTargets = candidates.map(candidate => {
      const target = document.elementFromPoint(graph.x + candidate.x, graph.y + candidate.y);
      return {
        candidate,
        isCytoscapeBackground:
          target !== null &&
          cytoscapeContainer.contains(target) &&
          getComputedStyle(target).pointerEvents !== 'none',
        target: target === null ? null : `${target.tagName}.${target.className}`,
      };
    });
    return {
      candidates: candidatesWithTargets,
      point:
        candidatesWithTargets.find(candidate => candidate.isCytoscapeBackground)?.candidate ?? null,
    };
  }, graph);
  assert(
    point !== null && point.point !== null,
    `No Cytoscape background point receives pointer events without a graph overlay: ${JSON.stringify(point)}.`
  );
  return point.point;
}

/*** Records the actual native event path through the Cytoscape container without reaching into its runtime. */
async function installGraphGestureProbeAsync(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as typeof window & { __atlasGraphGestureProbe?: GraphGestureProbe };
    const application = document.querySelector<HTMLElement>(
      '[role="application"][aria-label="Graph"]'
    );
    const cytoscapeContainer = application?.querySelector('canvas')?.parentElement;
    if (cytoscapeContainer === null || cytoscapeContainer === undefined) return;
    target.__atlasGraphGestureProbe = { mouseDownCount: 0, mouseMoveCount: 0, mouseUpCount: 0 };
    cytoscapeContainer.addEventListener('mousedown', () => {
      if (target.__atlasGraphGestureProbe !== undefined)
        target.__atlasGraphGestureProbe.mouseDownCount += 1;
    });
    cytoscapeContainer.ownerDocument.defaultView?.addEventListener('mousemove', () => {
      if (target.__atlasGraphGestureProbe !== undefined)
        target.__atlasGraphGestureProbe.mouseMoveCount += 1;
    });
    cytoscapeContainer.ownerDocument.defaultView?.addEventListener('mouseup', () => {
      if (target.__atlasGraphGestureProbe !== undefined)
        target.__atlasGraphGestureProbe.mouseUpCount += 1;
    });
  });
}

/*** Reads only the test-owned native event counters installed around the public graph surface. */
async function readGraphGestureProbeAsync(page: Page): Promise<GraphGestureProbe> {
  const probe = await page.evaluate(
    () =>
      (window as typeof window & { __atlasGraphGestureProbe?: GraphGestureProbe })
        .__atlasGraphGestureProbe ?? null
  );
  assert(probe !== null, 'Cytoscape gesture probe was unavailable.');
  return probe;
}

/*** Resolves the touch target from the same Atlas projection that supplies the browser GraphView. */
async function resolveResponsiveTouchGraphNodeIdsAsync(): Promise<readonly string[]> {
  const workspace = await loadFixtureWorkspaceAsync(
    `bulk-pending|include=${bulkSelectionIds.join(',')}`
  );
  assert(workspace.workspace.ok, 'Canonical bulk fixture workspace did not load.');
  const settings = readSettingsEnvironment();
  const elements = createPackageGraphElements(workspace.workspace.value.packageGraph);
  const projection = projectVisibleGraph({
    currentPackage: '',
    elements,
    showCompoundNodes: settings.showCompoundNodes,
    showVendorPackages: settings.showVendorPackages,
    subPackageDepth: settings.subPackageDepth,
  });
  const requestedNodeIds = projection.elements.nodes.flatMap(node => {
    const id = node.data.id;
    return typeof id === 'string' && id.length > 0 ? [id] : [];
  });
  const visibleNodeIds = createGraphViewModel(
    projection.elements,
    projection.elements,
    []
  ).nodes.map(node => node.id);
  assert(
    requestedNodeIds.length === visibleNodeIds.length &&
      requestedNodeIds.every(id => visibleNodeIds.includes(id)),
    `Responsive touch requested IDs do not match the visible projected node identities: requested ${requestedNodeIds.join(', ')}; visible ${visibleNodeIds.join(', ')}.`
  );
  return requestedNodeIds;
}

/*** Reads a controller-measured node from the canonical Atlas GraphView projection. */
async function readGraphNodeAsync(page: Page, nodeIds: readonly string[]) {
  try {
    await page.waitForFunction(nodeIds => {
      const probe = (window as typeof window & { __atlasViewportProbe?: GraphViewportProbe })
        .__atlasViewportProbe;
      return (probe?.controller?.measureNodes?.(nodeIds)?.nodes.length ?? 0) > 0;
    }, nodeIds);
  } catch (error) {
    const diagnostics = await readGraphTouchDiagnosticsAsync(page, nodeIds);
    throw new Error(
      `No canonical bulk graph node was measurable through the public GraphView controller; canonical node IDs: ${nodeIds.join(', ')}; measured IDs: ${diagnostics.measuredNodeIds.join(', ') || 'none'}; loading state: ${JSON.stringify(diagnostics.loading)}; selection state: ${JSON.stringify(diagnostics.selection)}. ${String(error)}`
    );
  }
  const node = await page.evaluate(nodeIds => {
    const probe = (window as typeof window & { __atlasViewportProbe?: GraphViewportProbe })
      .__atlasViewportProbe;
    return probe?.controller?.measureNodes?.(nodeIds)?.nodes[0] ?? null;
  }, nodeIds);
  assert(
    node !== null,
    'No measured graph node geometry was available for native touch acceptance.'
  );
  return node;
}

/*** Wait for the released controller to expose every requested projected graph node. */
async function waitForGraphNodesAsync(page: Page, nodeIds: readonly string[]): Promise<void> {
  await page.waitForFunction(ids => {
    const probe = (window as typeof window & { __atlasViewportProbe?: GraphViewportProbe })
      .__atlasViewportProbe;
    return probe?.controller?.measureNodes?.(ids)?.nodes.length === ids.length;
  }, nodeIds);
}

/*** Drives GraphView's public double-press interaction at the measured node center. */
async function doublePressGraphNodeAsync(
  page: Page,
  id: string,
  graphBounds: { readonly x: number; readonly y: number }
): Promise<void> {
  const node = await readGraphNodeAsync(page, [id]);
  await page.mouse.dblclick(graphBounds.x + node.position.x, graphBounds.y + node.position.y);
}

/*** Rejects the legacy identity that would render a phantom module/src compound. */
async function assertNoSyntheticModuleNodeAsync(page: Page, repositoryRoot: string): Promise<void> {
  const legacyId = `${repositoryRoot}.module.src`;
  const count = await page.evaluate(id => {
    const probe = (window as typeof window & { __atlasViewportProbe?: GraphViewportProbe })
      .__atlasViewportProbe;
    return probe?.controller?.measureNodes?.([id])?.nodes.length ?? 0;
  }, legacyId);
  assert(count === 0, `GraphView retained synthetic module identity ${legacyId}.`);
}

/*** Verifies that a native GraphView tap updates the user-visible synchronized tree selection. */
async function assertGraphTouchSelectionAsync(page: Page, tools: Locator): Promise<void> {
  await tools.click();
  await page.getByText('Workspace tools', { exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Tree' }).click();
  const tree = page.getByRole('tree', { name: 'Project tree' });
  try {
    await tree.locator('[role="treeitem"][aria-selected="true"]').first().waitFor();
  } catch (error) {
    const selectedTreeItems = await tree
      .locator('[role="treeitem"][aria-selected="true"]')
      .allTextContents();
    throw new Error(
      `Native graph touch did not produce a visible tree selection; selected tree items: ${JSON.stringify(selectedTreeItems)}. ${String(error)}`
    );
  }
  await closeWorkspaceToolsDialogAsync(page);
}

/*** Captures canonical node, loading, and synchronized-selection state when touch targeting fails. */
async function readGraphTouchDiagnosticsAsync(page: Page, nodeIds: readonly string[]) {
  const serializedNodeIds = JSON.stringify(nodeIds);
  return page.evaluate<GraphTouchDiagnostics, string>(serializedNodeIds => {
    const parsedNodeIds: unknown = JSON.parse(serializedNodeIds);
    if (!Array.isArray(parsedNodeIds))
      throw new Error('Graph touch diagnostics received invalid serialized node IDs.');
    const nodeIds: readonly string[] = parsedNodeIds.filter(
      (nodeId): nodeId is string => typeof nodeId === 'string'
    );
    if (nodeIds.length !== parsedNodeIds.length)
      throw new Error('Graph touch diagnostics received invalid serialized node IDs.');
    const probe = (window as typeof window & { __atlasViewportProbe?: GraphViewportProbe })
      .__atlasViewportProbe;
    const loadingStatus = document.querySelector(
      '[role="status"][aria-label="Repository loading status"]'
    );
    const selectedTreeIds = [
      ...document.querySelectorAll('[role="treeitem"][aria-selected="true"]'),
    ]
      .map(item => item.getAttribute('id') ?? item.textContent?.trim() ?? '')
      .filter(Boolean);
    const selectedRepositoryCheckboxes = [...document.querySelectorAll('[role="checkbox"]')]
      .filter(checkbox => checkbox.getAttribute('aria-label')?.startsWith('bulk-pending/') === true)
      .map(checkbox => ({
        checked: checkbox.getAttribute('aria-checked'),
        id: checkbox.getAttribute('aria-label'),
      }));
    return {
      loading: {
        present: loadingStatus !== null,
        text: loadingStatus?.textContent?.trim() ?? '',
      },
      measuredNodeIds: probe?.controller?.measureNodes?.(nodeIds)?.nodes.map(node => node.id) ?? [],
      selection: { selectedRepositoryCheckboxes, selectedTreeIds },
    };
  }, serializedNodeIds);
}

/*** Dispatches a two-finger Chromium touch sequence at the graph center to exercise pinch zoom. */
async function pinchGraphAsync(
  page: Page,
  graph: { readonly height: number; readonly width: number; readonly x: number; readonly y: number }
) {
  const session = await page.context().newCDPSession(page);
  const x = graph.x + graph.width / 2;
  const y = graph.y + graph.height / 2;
  const touchPoint = (offset: number) => [
    { id: 1, x: x - offset, y },
    { id: 2, x: x + offset, y },
  ];
  await session.send('Input.dispatchTouchEvent', {
    touchPoints: touchPoint(20),
    type: 'touchStart',
  });
  await session.send('Input.dispatchTouchEvent', {
    touchPoints: touchPoint(70),
    type: 'touchMove',
  });
  await session.send('Input.dispatchTouchEvent', { touchPoints: [], type: 'touchEnd' });
  await session.detach();
}

/*** Rejects an incomplete or duplicate scenario registry before a browser can produce misleading evidence. */
function assertScenarioRegistry(): void {
  const scenarioIds = scenarios.map(scenario => scenario.id);
  assert(scenarioIds.length === 30, `Expected exactly 30 scenarios, found ${scenarioIds.length}.`);
  assert(
    new Set(scenarioIds).size === scenarioIds.length,
    'Scenario registry contains duplicate IDs.'
  );
}

/*** Records every bounding box that defines the sidebar, content region, graph viewport, and status overlay. */
async function captureWorkspaceGeometryAsync(page: Page): Promise<WorkspaceGeometry> {
  const geometry = await page.evaluate(() => {
    const bounds = (element: Element) => {
      const { bottom, height, left, right, top, width } = element.getBoundingClientRect();
      return { bottom, height, left, right, top, width };
    };
    const graph = document.querySelector('[role="application"][aria-label="Graph"]');
    const main = document.querySelector('[data-testid="main"]');
    const overlay = document.querySelector(
      '[role="status"][aria-label="Repository loading status"]'
    );
    const sidebar = document.querySelector('[data-testid="sidebar-tree-scroll"]')?.closest('aside');
    const workspaceContent = document.querySelector('[data-testid="workspace-content"]');
    if (graph === null || main === null || workspaceContent === null) return null;
    return {
      graph: bounds(graph),
      main: bounds(main),
      overlay: overlay === null ? null : bounds(overlay),
      sidebar: sidebar === null || sidebar === undefined ? null : bounds(sidebar),
      viewport: { height: window.innerHeight, width: window.innerWidth },
      workspaceContent: bounds(workspaceContent),
    };
  });
  assert(
    geometry !== null,
    'Anonymous bulk workspace did not render its main, content, and graph.'
  );
  return geometry;
}

/*** Proves the absolute status overlay preserves the measured usable graph region through bulk progress and theme changes. */
function assertAnonymousBulkWorkspaceGeometry(
  geometry: {
    readonly afterCompletion: WorkspaceGeometry;
    readonly afterThemeChange: WorkspaceGeometry;
    readonly beforeSelection: WorkspaceGeometry;
    readonly duringProgress: WorkspaceGeometry;
  },
  viewport: { readonly height: number; readonly width: number }
) {
  assertWorkspaceGeometryBaseline(geometry.beforeSelection, viewport, 'before selection');
  assertWorkspaceGeometryBaseline(geometry.duringProgress, viewport, 'during progress');
  assertWorkspaceGeometryBaseline(geometry.afterCompletion, viewport, 'after completion');
  assertWorkspaceGeometryBaseline(geometry.afterThemeChange, viewport, 'after theme change');
  assert(
    geometry.duringProgress.overlay !== null,
    'Anonymous bulk progress did not render its status overlay.'
  );
  assertBoundsContained(
    geometry.duringProgress.overlay,
    geometry.duringProgress.workspaceContent,
    'Anonymous bulk overlay escaped its workspace content region.'
  );
  for (const [phase, current] of [
    ['during progress', geometry.duringProgress],
    ['after completion', geometry.afterCompletion],
    ['after theme change', geometry.afterThemeChange],
  ] as const)
    assertBoundsEqual(
      current.graph,
      geometry.beforeSelection.graph,
      `Anonymous bulk ${phase} changed the usable graph bounds.`
    );
}

/*** Verifies the shell keeps the reference frame inset and fixed sidebar geometry. */
function assertWorkspaceGeometryBaseline(
  geometry: WorkspaceGeometry,
  viewport: { readonly height: number; readonly width: number },
  phase: string
) {
  assertDimensionsEqual(
    geometry.viewport,
    viewport,
    `Anonymous bulk ${phase} changed the viewport.`
  );
  if (viewport.width <= 768) {
    assert(
      geometry.sidebar === null,
      `Anonymous bulk ${phase} left the desktop sidebar visible on mobile.`
    );
    assert(
      geometry.workspaceContent.left === 0 && geometry.workspaceContent.width === viewport.width,
      `Anonymous bulk ${phase} did not allocate the full mobile width to workspace content.`
    );
  } else {
    assert(
      geometry.sidebar !== null,
      `Anonymous bulk ${phase} did not render the desktop sidebar.`
    );
    assert(
      geometry.sidebar.left === referenceDesktopFramePadding + referenceDesktopPanelMargin,
      `Anonymous bulk ${phase} shifted the sidebar.`
    );
    assert(
      geometry.sidebar.width === referenceDesktopSidebarWidth,
      `Anonymous bulk ${phase} changed the sidebar width.`
    );
  }
  assertBoundsContained(
    geometry.graph,
    geometry.workspaceContent,
    `Anonymous bulk ${phase} placed the graph outside usable workspace content.`
  );
}

/*** Allows only device-pixel rounding while requiring a measured browser layout invariant. */
function assertBoundsEqual(actual: Bounds, expected: Bounds, message: string) {
  const tolerance = 1;
  for (const key of ['bottom', 'height', 'left', 'right', 'top', 'width'] as const)
    assert(
      Math.abs(actual[key] - expected[key]) <= tolerance,
      `${message} ${JSON.stringify({ actual, expected, key, tolerance })}`
    );
}

/*** Verifies the browser viewport itself remains at the exact requested dimensions. */
function assertDimensionsEqual(
  actual: { readonly height: number; readonly width: number },
  expected: { readonly height: number; readonly width: number },
  message: string
) {
  assert(
    actual.height === expected.height && actual.width === expected.width,
    `${message} ${JSON.stringify({ actual, expected })}`
  );
}

/*** Toggles whichever theme action is currently exposed without assuming the browser's initial color scheme. */
async function toggleThemeAsync(page: Page) {
  const darkAction = page.getByRole('button', { exact: true, name: 'Switch to dark mode' });
  if (await darkAction.isVisible()) {
    await darkAction.click();
    await page.getByRole('button', { exact: true, name: 'Switch to light mode' }).waitFor();
    return;
  }
  await page.getByRole('button', { exact: true, name: 'Switch to light mode' }).click();
  await darkAction.waitFor();
}

/*** Selects a concrete ZORA theme without depending on the context's initial color preference. */
async function setThemeAsync(page: Page, theme: 'dark' | 'light') {
  const currentAction = `Switch to ${theme === 'dark' ? 'dark' : 'light'} mode`;
  const action = page.getByRole('button', { exact: true, name: currentAction });
  if (await action.isVisible()) await action.click();
  await page
    .getByRole('button', {
      exact: true,
      name: `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`,
    })
    .waitFor();
}

/*** Rejects a graph or overlay that crosses the content allocation that owns it. */
function assertBoundsContained(inner: Bounds, outer: Bounds, message: string) {
  const tolerance = 1;
  assert(
    inner.left >= outer.left - tolerance &&
      inner.right <= outer.right + tolerance &&
      inner.top >= outer.top - tolerance &&
      inner.bottom <= outer.bottom + tolerance,
    `${message} ${JSON.stringify({ inner, outer, tolerance })}`
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
