import { access, mkdir, writeFile } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

import { chromium, type Browser, type Page } from 'playwright-core';

const browserPath = process.env.ATLAS_CHROME;
if (browserPath === undefined) throw new Error('Missing ENV: ATLAS_CHROME');

const port = 4800 + Math.floor(Math.random() * 200);
const url = `http://127.0.0.1:${port}`;
const fixtureApplication = resolve('test/e2e/next-fixture-app');
const fixtureBuildDirectory = resolve(fixtureApplication, 'build-workspace-loading');
const evidenceDirectory = resolve('artifacts/workspace-loading-browser');
const scenarios = createScenarios();
const results: ScenarioResult[] = [];
const fixtureEnvironment = { ...process.env, ATLAS_FIXTURE_DIST_DIR: 'build-workspace-loading' };

type Bounds = {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
};
type Scenario = {
  readonly mode: 'dark' | 'light';
  readonly phase: 'hydrated' | 'ssr';
  readonly viewport: { readonly height: number; readonly name: string; readonly width: number };
};
type ScenarioResult = {
  readonly artifacts: readonly string[];
  readonly diagnostics: LoadingDiagnostics | undefined;
  readonly id: string;
  readonly issue: string | undefined;
  readonly status: 'failed' | 'passed';
};
type LoadingDiagnostics = {
  readonly indicator: Bounds;
  readonly indicatorCount: number;
  readonly loaderStyleElementCount: number;
  readonly reactNativeWebStyleSheetCount: number;
  readonly region: Bounds;
  readonly styleElementCount: number;
  readonly styleSheetCount: number;
};

let browser: Browser | undefined;
let server: ChildProcess | undefined;

await runAcceptanceAsync();

/*** Runs the full viewport, theme, and SSR-hydration matrix against a Next production build. */
async function runAcceptanceAsync(): Promise<void> {
  await mkdir(evidenceDirectory, { recursive: true });
  try {
    await assertFixtureBuildAsync();
    await startFixtureServerAsync();
    await waitForServerAsync();
    browser = await chromium.launch({ executablePath: browserPath, headless: true });
    for (const scenario of scenarios) results.push(await runScenarioAsync(scenario));
    markTransitionFailures(results);
  } finally {
    await browser?.close();
    await stopFixtureServerAsync();
  }
  await writeFile(resolve(evidenceDirectory, 'report.json'), JSON.stringify(results, null, 2));
  const failures = results.filter(result => result.status === 'failed');
  if (failures.length > 0)
    throw new Error(
      `${failures.length} workspace loading scenarios failed; inspect ${resolve(
        evidenceDirectory,
        'report.json'
      )}.`
    );
}

/*** Refuses to run unless the fixture was built by the paired Next production-build command. */
async function assertFixtureBuildAsync(): Promise<void> {
  await Promise.all([
    access(resolve(fixtureBuildDirectory, 'BUILD_ID')),
    access(resolve(fixtureBuildDirectory, 'static')),
  ]);
}

/*** Starts one owned production server for every browser scenario in the acceptance matrix. */
async function startFixtureServerAsync(): Promise<void> {
  server = spawn(
    process.platform === 'win32' ? 'bunx.cmd' : 'bunx',
    ['next', 'start', '--port', String(port)],
    {
      cwd: fixtureApplication,
      detached: process.platform !== 'win32',
      env: fixtureEnvironment,
      stdio: 'pipe',
    }
  );
  if (server.pid === undefined)
    throw new Error('Fixture server did not expose a process identifier.');
}

/*** Waits for the production server to accept requests without coupling UI assertions to elapsed time. */
async function waitForServerAsync(): Promise<void> {
  const deadline = performance.now() + 15_000;
  while (performance.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is still starting; readiness is proven by an HTTP response.
    }
    await Bun.sleep(50);
  }
  throw new Error('Timed out waiting for the Next production fixture server.');
}

/*** Records a scenario's rendered geometry and serialised server HTML before or after hydration. */
async function runScenarioAsync(scenario: Scenario): Promise<ScenarioResult> {
  const id = `${scenario.phase}-${scenario.viewport.name}-${scenario.mode}`;
  const context = await browser!.newContext({
    javaScriptEnabled: scenario.phase === 'hydrated',
    viewport: { height: scenario.viewport.height, width: scenario.viewport.width },
  });
  const page = await context.newPage();
  const artifacts = [
    resolve(evidenceDirectory, `${id}.png`),
    resolve(evidenceDirectory, `${id}.html`),
  ];
  try {
    await page.goto(`${url}/loading?mode=${scenario.mode}`, { waitUntil: 'domcontentloaded' });
    if (scenario.phase === 'hydrated')
      await page.waitForFunction(
        () => document.documentElement.dataset.workspaceLoadingHydrated === 'true'
      );
    await page.screenshot({ path: artifacts[0] });
    await writeFile(artifacts[1], await page.content());
    const diagnostics = await readDiagnosticsAsync(page);
    const issue = validateDiagnostics(diagnostics);
    return {
      artifacts,
      diagnostics,
      id,
      issue,
      status: issue === undefined ? 'passed' : 'failed',
    };
  } catch (error) {
    return { artifacts, diagnostics: undefined, id, issue: String(error), status: 'failed' };
  } finally {
    await context.close();
  }
}

/*** Marks a first-frame mismatch when hydration changes the spinner bounds for one theme and viewport. */
function markTransitionFailures(matrix: ScenarioResult[]): void {
  for (const viewport of ['mobile', 'desktop']) {
    for (const mode of ['light', 'dark']) {
      const ssr = matrix.find(result => result.id === `ssr-${viewport}-${mode}`);
      const hydrated = matrix.find(result => result.id === `hydrated-${viewport}-${mode}`);
      if (ssr?.diagnostics === undefined || hydrated?.diagnostics === undefined) continue;
      const difference = boundsDifference(
        ssr.diagnostics.indicator,
        hydrated.diagnostics.indicator
      );
      if (difference <= 0.5) continue;
      const issue = `Indicator changed by ${difference}px between SSR and hydration.`;
      markFailure(matrix, ssr.id, issue);
      markFailure(matrix, hydrated.id, issue);
    }
  }
}

/*** Calculates the largest positional or dimensional delta between two first-frame measurements. */
function boundsDifference(first: Bounds, second: Bounds): number {
  return Math.max(
    Math.abs(first.height - second.height),
    Math.abs(first.left - second.left),
    Math.abs(first.top - second.top),
    Math.abs(first.width - second.width)
  );
}

/*** Replaces one matrix result with its transition failure while retaining all evidence paths. */
function markFailure(matrix: ScenarioResult[], id: string, issue: string): void {
  const index = matrix.findIndex(result => result.id === id);
  if (index === -1) return;
  const existingIssue = matrix[index]?.issue;
  matrix[index] = {
    ...matrix[index],
    issue: existingIssue === undefined ? issue : `${existingIssue} ${issue}`,
    status: 'failed',
  };
}

/*** Extracts the loading element and its graph-region bounds from the actual rendered page. */
function readDiagnosticsAsync(page: Page): Promise<LoadingDiagnostics> {
  return page.evaluate(() => {
    const indicator = document.querySelector('[data-testid="loader"]');
    const region = document.querySelector('[data-testid="workspace-loading-region"]');
    if (!(indicator instanceof HTMLElement) || !(region instanceof HTMLElement))
      throw new Error('The workspace loading indicator or its graph region was not rendered.');
    const toBounds = (element: HTMLElement) => {
      const { height, left, top, width } = element.getBoundingClientRect();
      return { height, left, top, width };
    };
    return {
      indicator: toBounds(indicator),
      indicatorCount: document.querySelectorAll('[data-testid="loader"]').length,
      loaderStyleElementCount: [...document.querySelectorAll('style')].filter(style =>
        style.textContent?.includes('loader')
      ).length,
      reactNativeWebStyleSheetCount: document.querySelectorAll('style#react-native-stylesheet')
        .length,
      region: toBounds(region),
      styleElementCount: document.querySelectorAll('style').length,
      styleSheetCount: document.styleSheets.length,
    };
  });
}

/*** Enforces the published consumer contract: a compact, centered spinner in the available graph region. */
function validateDiagnostics(diagnostics: LoadingDiagnostics): string | undefined {
  const {
    indicator,
    indicatorCount,
    loaderStyleElementCount,
    reactNativeWebStyleSheetCount,
    region,
  } = diagnostics;
  const expectedIndicatorSize = 20;
  const centerTolerance = 1;
  const horizontalOffset = Math.abs(
    indicator.left + indicator.width / 2 - (region.left + region.width / 2)
  );
  const verticalOffset = Math.abs(
    indicator.top + indicator.height / 2 - (region.top + region.height / 2)
  );
  const issues = [];
  if (
    Math.abs(indicator.width - expectedIndicatorSize) > centerTolerance ||
    Math.abs(indicator.height - expectedIndicatorSize) > centerTolerance
  )
    issues.push(
      `Indicator is not ${expectedIndicatorSize}x${expectedIndicatorSize}px: ${indicator.width}x${indicator.height}px.`
    );
  if (horizontalOffset > centerTolerance || verticalOffset > centerTolerance)
    issues.push(
      `Indicator is not centered: horizontal ${horizontalOffset}px, vertical ${verticalOffset}px.`
    );
  if (indicatorCount !== 1) issues.push(`Expected one indicator, found ${indicatorCount}.`);
  if (reactNativeWebStyleSheetCount !== 1)
    issues.push(
      `Expected one React Native Web stylesheet, found ${reactNativeWebStyleSheetCount}.`
    );
  if (loaderStyleElementCount !== 0)
    issues.push(`Found ${loaderStyleElementCount} CSS override(s) for the indicator.`);
  return issues.length === 0 ? undefined : issues.join(' ');
}

/*** Terminates only the Next server process group that this runner created. */
async function stopFixtureServerAsync(): Promise<void> {
  if (server?.pid === undefined) return;
  if (process.platform === 'win32') server.kill('SIGTERM');
  else {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch (error) {
      if (!isMissingProcessError(error)) throw error;
    }
  }
}

/*** Identifies an already-exited owned process group so cleanup cannot hide acceptance evidence. */
function isMissingProcessError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ESRCH';
}

/*** Enumerates the required SSR and hydrated first-frame matrix without omitting a theme or viewport. */
function createScenarios(): readonly Scenario[] {
  return [
    { height: 844, name: 'mobile', width: 390 },
    { height: 900, name: 'desktop', width: 1440 },
  ].flatMap(viewport =>
    (['light', 'dark'] as const).flatMap(mode =>
      (['ssr', 'hydrated'] as const).map(phase => ({ mode, phase, viewport }))
    )
  );
}
