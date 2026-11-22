import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { GraphViewController } from '@ankhorage/zora/web/graph-view';
import { chromium, type Page } from 'playwright-core';

import {
  assertProductionCompoundCanvasAsync,
  installProductionGraphProbeAsync,
} from './productionCompoundCanvas';

const reportPath = resolve(process.env.ATLAS_OFFLINE_REPORT ?? 'offline-smoke.html');
const browserPath = process.env.ATLAS_CHROME;
const projectName = process.env.ATLAS_PROJECT_NAME ?? 'my-app';
const requireCompoundNodes = process.env.ATLAS_REQUIRE_COMPOUND_NODES === 'true';
const layoutLabels = ['Breadthfirst', 'Circle', 'Concentric', 'Elk: Layered', 'Grid'] as const;

if (browserPath === undefined)
  throw new Error('ATLAS_CHROME must point to an installed Chrome or Chromium binary.');

const temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'atlas-offline-browser-'));
const copiedReportPath = resolve(temporaryDirectory, basename(reportPath));
await cp(reportPath, copiedReportPath);

const context = await chromium.launchPersistentContext(resolve(temporaryDirectory, 'profile'), {
  executablePath: browserPath,
  headless: true,
  viewport: { height: 960, width: 1280 },
});

try {
  const offline = await context.newPage();
  await installProductionGraphProbeAsync(offline);
  const networkAttempts = observeOfflineRuntime(offline);
  await offline.goto(pathToFileURL(copiedReportPath).href, { waitUntil: 'networkidle' });
  await assertWorkspace(offline, networkAttempts);
  await assertUnavailableOfflineActions(offline);
  if (networkAttempts.length > 0)
    throw new Error(`Unexpected offline network attempts: ${networkAttempts.join(', ')}`);

  await assertInvalidSnapshot(context, copiedReportPath);

  if (process.env.ATLAS_ONLINE_URL !== undefined) {
    const online = await context.newPage();
    if (requireCompoundNodes) await installProductionGraphProbeAsync(online);
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
    .getByText(projectName, { exact: true })
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

  if (requireCompoundNodes) await assertProductionCompoundCanvasAsync(page);
  else {
    await assertGenericWorkspaceInteractions(page);
  }
  await assertOfflineSettingsInteractions(page);
  await assertDarkTheme(page);
}

/*** Covers graph selection and rule evidence in the representative Java workspace smoke fixture. */
async function assertGenericWorkspaceInteractions(page: Page): Promise<void> {
  await selectGraphNodes(page);
  await assertRuleEvidence(page);
}

/*** Exercise the persistent presentation controls that an offline snapshot intentionally retains. */
async function assertOfflineSettingsInteractions(page: Page): Promise<void> {
  const packagePrefix = page.getByLabel('Package prefix', { exact: true });
  await packagePrefix.fill('com.');
  await packagePrefix.fill('');

  const switches = page.locator('[data-testid^="switch-"]');
  const switchCount = await switches.count();
  for (let index = 0; index < switchCount; index += 1) {
    await switches.nth(index).click();
    await switches.nth(index).click();
  }

  const depth = page.getByLabel('Subpackage depth', { exact: true });
  await depth.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');

  const spacing = page.getByLabel('Layout Spacing', { exact: true });
  await spacing.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');

  const layout = page.getByTestId('cytoscape-layout-trigger');
  const originalLayout = await readSelectedLayout(layout);
  const alternativeLayout = originalLayout === 'Circle' ? 'Grid' : 'Circle';
  await selectLayout(page, alternativeLayout);
  if ((await readSelectedLayout(layout)) !== alternativeLayout) {
    throw new Error(`Layout did not change from ${originalLayout} to ${alternativeLayout}.`);
  }
  await selectLayout(page, originalLayout);
  if ((await readSelectedLayout(layout)) !== originalLayout) {
    throw new Error(`Layout did not restore to ${originalLayout}.`);
  }
}

/*** Selects a layout through ZORA Select's public trigger and option controls. */
async function selectLayout(page: Page, layout: string): Promise<void> {
  const trigger = page.getByTestId('cytoscape-layout-trigger');
  await trigger.click();
  await page.getByTestId(`cytoscape-layout-option-${layout.toLowerCase()}`).click();
  await trigger.getByText(layout, { exact: true }).waitFor();
}

/*** Reads the user-visible layout label from ZORA Select's public trigger. */
async function readSelectedLayout(layout: ReturnType<Page['getByTestId']>): Promise<string> {
  for (const label of layoutLabels) {
    if (await layout.getByText(label, { exact: true }).isVisible()) return label;
  }
  throw new Error('ZORA Select did not render a known layout label in its trigger.');
}

/*** Verifies user-visible audit evidence without guessing a canvas node position. */
async function assertRuleEvidence(page: Page): Promise<void> {
  const ruleTab = page.getByRole('tab', { name: /Rules/ });
  await ruleTab.click();
  await page
    .getByText('Cyclic Dependencies', { exact: true })
    .waitFor({ timeout: 5000 })
    .catch(async () => {
      throw new Error(`Audit rule panel did not render: ${await page.locator('body').innerText()}`);
    });
}

/*** Enters dark mode and proves the workspace surface follows the selected theme. */
async function assertDarkTheme(page: Page): Promise<void> {
  const darkAction = page.getByRole('button', { name: 'Switch to dark mode', exact: true });
  if ((await darkAction.count()) === 0) {
    await page.getByRole('button', { name: 'Switch to light mode', exact: true }).waitFor();
    return;
  }

  const workspace = page.getByTestId('main');
  const lightSurface = await workspace.evaluate(
    element => getComputedStyle(element).backgroundColor
  );
  await darkAction.click();
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).waitFor();
  const darkSurface = await workspace.evaluate(
    element => getComputedStyle(element).backgroundColor
  );
  if (darkSurface === lightSurface)
    throw new Error('Dark mode did not change the workspace surface.');
}

async function selectGraphNodes(page: Page): Promise<void> {
  const graph = page.getByRole('application', { name: 'Graph' });
  const nodeIds = ['com.example.myapp.a', 'com.example.myapp.b'];
  const depth = page.getByLabel('Subpackage depth', { exact: true });
  await depth.press('End');
  const nodes = await readMeasuredGraphNodesAsync(page, nodeIds);
  const box = await graph.boundingBox();
  if (box === null) throw new Error('Graph canvas is not visible.');
  if (nodes.some(node => node.position.x <= 0 || node.position.y <= 0))
    throw new Error(`GraphView reported unusable node geometry: ${JSON.stringify(nodes)}`);

  const firstTarget = {
    x: box.x + nodes[0]!.position.x,
    y: box.y + nodes[0]!.position.y,
  };
  const secondTarget = {
    x: box.x + nodes[1]!.position.x,
    y: box.y + nodes[1]!.position.y,
  };
  await installGraphInputProbeAsync(page);
  await assertGraphHitTargetAsync(page, firstTarget);
  await page.mouse.click(firstTarget.x, firstTarget.y);
  await page.getByRole('treeitem', { selected: true }).waitFor();
  const firstSelection = await readSelectedTreeItems(page);
  if (firstSelection.length !== 1 || !firstSelection[0]?.endsWith('a'))
    throw new Error(`Graph-node click selected ${JSON.stringify(firstSelection)}, expected a.`);

  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await assertGraphHitTargetAsync(page, secondTarget);
  await page.keyboard.down(modifier);
  try {
    await page.mouse.click(secondTarget.x, secondTarget.y);
  } finally {
    await page.keyboard.up(modifier);
  }
  await waitForModifiedGraphPointerAsync(page, modifier === 'Meta' ? 'metaKey' : 'ctrlKey');
  await waitForGraphSelectionAsync(page, nodeIds, secondTarget);
  const selection = await readSelectedTreeItems(page);
  if (
    selection.length !== 2 ||
    !selection.some(item => item.endsWith('a')) ||
    !selection.some(item => item.endsWith('b'))
  )
    throw new Error(
      `Modified GraphView click selected ${JSON.stringify(selection)}, expected a and b.`
    );
}

/*** Records bounded native pointer input at document capture so GraphView root replacement cannot orphan the probe. */
async function installGraphInputProbeAsync(page: Page): Promise<void> {
  await page.evaluate(() => {
    const graph = document.querySelector('[role="application"][aria-label="Graph"]');
    if (graph === null) throw new Error('Graph application was unavailable for input probing.');
    const target = window as typeof window & { __atlasGraphInputProbe?: GraphInputProbe };
    target.__atlasGraphInputProbe = { events: [] };
    document.addEventListener(
      'pointerdown',
      event => {
        const current = target.__atlasGraphInputProbe;
        if (current === undefined) return;
        const pointerEvent = event as PointerEvent;
        const currentGraph = document.querySelector('[role="application"][aria-label="Graph"]');
        const graphTarget =
          event.target instanceof Node && currentGraph?.contains(event.target) === true;
        target.__atlasGraphInputProbe = {
          events: [
            ...current.events.slice(-7),
            {
              ctrlKey: pointerEvent.ctrlKey,
              clientX: pointerEvent.clientX,
              clientY: pointerEvent.clientY,
              graphTarget,
              metaKey: pointerEvent.metaKey,
              probeGraphConnected: graph.isConnected,
              probeGraphIsCurrent: graph === currentGraph,
              targetTagName: event.target instanceof Element ? event.target.tagName : null,
              type: event.type,
            },
          ],
        };
      },
      { capture: true }
    );
  });
}

/*** Waits for synchronized tree multi-selection and reports the observed graph input and public geometry on failure. */
async function waitForGraphSelectionAsync(
  page: Page,
  nodeIds: readonly string[],
  expectedTarget: { readonly x: number; readonly y: number }
): Promise<void> {
  try {
    await page.waitForFunction(
      () => document.querySelectorAll('[role="treeitem"][aria-selected="true"]').length === 2
    );
  } catch (error) {
    const diagnostic = await readGraphSelectionDiagnosticAsync(page, nodeIds, expectedTarget);
    throw new Error(
      `Modified GraphView click did not create synchronized multi-selection: ${JSON.stringify(diagnostic)}`,
      { cause: error }
    );
  }
}

/*** Reads bounded public graph, document, pointer, and synchronized-tree state for a failed modified graph click. */
async function readGraphSelectionDiagnosticAsync(
  page: Page,
  nodeIds: readonly string[],
  expectedTarget: { readonly x: number; readonly y: number }
): Promise<unknown> {
  return page.evaluate(
    ({ ids, target }) => {
      const windowTarget = window as typeof window & {
        __atlasGraphAcceptance?: GraphProbe;
        __atlasGraphInputProbe?: GraphInputProbe;
      };
      const graph = document.querySelector('[role="application"][aria-label="Graph"]');
      const bounds = graph?.getBoundingClientRect();
      return {
        activeElement: document.activeElement?.tagName ?? null,
        expectedTarget: target,
        graphBounds:
          bounds === undefined
            ? null
            : { height: bounds.height, width: bounds.width, x: bounds.x, y: bounds.y },
        graphConnected: graph?.isConnected ?? false,
        measuredNodes:
          windowTarget.__atlasGraphAcceptance?.controller?.measureNodes?.(ids)?.nodes ?? [],
        pointerEvents: windowTarget.__atlasGraphInputProbe?.events ?? [],
        selectedTreeItems: [
          ...document.querySelectorAll('[role="treeitem"][aria-selected="true"]'),
        ].map(item => item.getAttribute('aria-label') ?? item.textContent ?? ''),
      };
    },
    { ids: nodeIds, target: expectedTarget }
  );
}

/*** Waits for the modified native GraphView input and reports bounded live evidence when it is absent. */
async function waitForModifiedGraphPointerAsync(
  page: Page,
  expectedModifier: 'ctrlKey' | 'metaKey'
): Promise<void> {
  try {
    await page.waitForFunction(modifier => {
      const probe = (window as typeof window & { __atlasGraphInputProbe?: GraphInputProbe })
        .__atlasGraphInputProbe;
      return probe?.events.some(
        event => event.type === 'pointerdown' && event.graphTarget && event[modifier]
      );
    }, expectedModifier);
  } catch (error) {
    const diagnostic = await page.evaluate(() => {
      const probe = (window as typeof window & { __atlasGraphInputProbe?: GraphInputProbe })
        .__atlasGraphInputProbe;
      const graph = document.querySelector('[role="application"][aria-label="Graph"]');
      return {
        events: probe?.events ?? [],
        graphConnected: graph?.isConnected ?? false,
        selectedTreeItems: document.querySelectorAll('[role="treeitem"][aria-selected="true"]')
          .length,
      };
    });
    throw new Error(
      `Modified GraphView pointer input was not observed for ${expectedModifier}: ${JSON.stringify(diagnostic)}`,
      { cause: error }
    );
  }
}

/*** Verifies that a controller-measured coordinate resolves to a pointer-enabled GraphView target. */
async function assertGraphHitTargetAsync(
  page: Page,
  point: { readonly x: number; readonly y: number }
): Promise<void> {
  const hitTarget = await page.evaluate(({ x, y }) => {
    const graph = document.querySelector('[role="application"][aria-label="Graph"]');
    const target = document.elementFromPoint(x, y);
    return {
      graphTarget: graph !== null && target !== null && graph.contains(target),
      pointerEvents: target === null ? null : getComputedStyle(target).pointerEvents,
      tagName: target?.tagName ?? null,
    };
  }, point);
  if (!hitTarget.graphTarget || hitTarget.pointerEvents === 'none')
    throw new Error(
      `Measured GraphView coordinate missed a pointer target: ${JSON.stringify(hitTarget)}`
    );
}

/*** Reads exact public GraphView hit geometry so native clicks target two distinct rendered nodes. */
async function readMeasuredGraphNodesAsync(page: Page, nodeIds: readonly string[]) {
  await page.waitForFunction(ids => {
    const probe = (window as typeof window & { __atlasGraphAcceptance?: GraphProbe })
      .__atlasGraphAcceptance;
    return probe?.controller?.measureNodes?.(ids)?.nodes.length === ids.length;
  }, nodeIds);
  await page.waitForFunction(async ids => {
    const probe = (window as typeof window & { __atlasGraphAcceptance?: GraphProbe })
      .__atlasGraphAcceptance;
    const before = probe?.controller?.measureNodes?.(ids)?.nodes;
    if (before === undefined || before.length !== ids.length) return false;
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
    const after = probe?.controller?.measureNodes?.(ids)?.nodes;
    return JSON.stringify(after) === JSON.stringify(before);
  }, nodeIds);
  const measurement = await page.evaluate(ids => {
    const probe = (window as typeof window & { __atlasGraphAcceptance?: GraphProbe })
      .__atlasGraphAcceptance;
    return probe?.controller?.measureNodes?.(ids)?.nodes ?? [];
  }, nodeIds);
  if (measurement.length !== nodeIds.length)
    throw new Error(
      `GraphView did not measure both selection targets: ${JSON.stringify(measurement)}`
    );
  return measurement;
}

interface GraphProbe {
  readonly controller: GraphViewController | null;
}

interface GraphInputProbe {
  readonly events: readonly {
    readonly ctrlKey: boolean;
    readonly clientX: number;
    readonly clientY: number;
    readonly graphTarget: boolean;
    readonly metaKey: boolean;
    readonly probeGraphConnected: boolean;
    readonly probeGraphIsCurrent: boolean;
    readonly targetTagName: string | null;
    readonly type: string;
  }[];
}

async function assertUnavailableOfflineActions(page: Page): Promise<void> {
  if ((await page.getByRole('button', { name: /Export|JSON|XML/i }).count()) > 0) {
    throw new Error('Offline workspace exposed a live export action.');
  }
  if ((await page.getByRole('button', { name: /Retry|Refresh/i }).count()) > 0) {
    throw new Error('Offline workspace exposed a repository retry or refresh action.');
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
  await assertEqual('tree identities and labels', await readTree(offline), await readTree(online));
  await assertEqual(
    'tree selections after real graph interactions',
    await readSelectedTreeItems(offline),
    await readSelectedTreeItems(online)
  );
  await assertEqual(
    'breadcrumbs after graph selection',
    await readBreadcrumbs(offline),
    await readBreadcrumbs(online)
  );
  await assertEqual('graph controls', await readGraph(offline), await readGraph(online));
  await assertEqual('Rules and cycle findings', await readRules(offline), await readRules(online));
}

/*** Read the accessible project-tree identity rather than comparing only its item count. */
async function readTree(page: Page): Promise<readonly string[]> {
  return page
    .getByRole('treeitem')
    .evaluateAll(items =>
      items.map(
        item =>
          `${item.getAttribute('id') ?? ''}:${item.getAttribute('aria-label') ?? item.textContent ?? ''}`
      )
    );
}

/*** Read selected tree labels produced by the real graph-node click interactions above. */
async function readSelectedTreeItems(page: Page): Promise<readonly string[]> {
  return page
    .getByRole('treeitem', { selected: true })
    .evaluateAll(items =>
      items.map(item => item.getAttribute('aria-label') ?? item.textContent ?? '')
    );
}

/*** Read the visible navigation trail after synchronized graph and tree selection. */
async function readBreadcrumbs(page: Page): Promise<readonly string[]> {
  const breadcrumbText = await page.getByTestId('workspace-breadcrumbs').innerText();
  return breadcrumbText
    .split('›')
    .map(label => label.trim().split('\n').at(-1) ?? '')
    .filter(Boolean);
}

/*** Compare live graph controls while graph-node selection is observed through the synchronized tree. */
async function readGraph(page: Page): Promise<readonly [number, string]> {
  return [
    await page.getByRole('application', { name: 'Graph' }).locator('canvas').count(),
    await page.getByLabel('Zoom').inputValue(),
  ];
}

/*** Read the rules panel's user-visible audit and cycle evidence. */
async function readRules(page: Page): Promise<string> {
  const ruleTab = page.getByRole('tab', { name: /Rules/ });
  await ruleTab.click();
  return page.getByRole('tabpanel').innerText();
}

/*** Fail parity checks with the semantic values that diverged. */
async function assertEqual(label: string, offline: unknown, online: unknown): Promise<void> {
  if (JSON.stringify(offline) !== JSON.stringify(online)) {
    throw new Error(
      `Online/offline ${label} parity mismatch: ${JSON.stringify({ offline, online })}`
    );
  }
}
