import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { GraphView, type GraphViewController } from '@zora/graph-view';
import type { Page } from 'playwright-core';

interface BrowserGraphProbe {
  controller: GraphViewController | null;
  layoutCount: number;
}

/*** Capture only the published GraphView controller events inside the test browser context. */
export async function installProductionGraphProbeAsync(page: Page): Promise<void> {
  await page.addInitScript(({ ready, layoutComplete }) => {
    const target = window as typeof window & { __atlasGraphAcceptance?: BrowserGraphProbe };
    const probe: BrowserGraphProbe = { controller: null, layoutCount: 0 };
    target.__atlasGraphAcceptance = probe;
    const capture = (event: Event) => {
      if (!(event instanceof CustomEvent) || !(event.target instanceof HTMLElement)) return;
      if (event.target.getAttribute('role') !== 'application') return;
      if (event.target.getAttribute('aria-label') !== 'Graph') return;
      const detail: unknown = event.detail;
      if (typeof detail !== 'object' || detail === null || !('controller' in detail))
        return;
      const controller = detail.controller;
      if (
        typeof controller !== 'object' ||
        controller === null ||
        !('measureNodes' in controller) ||
        typeof controller.measureNodes !== 'function'
      ) return;
      probe.controller = controller as GraphViewController;
      if (event.type === layoutComplete) probe.layoutCount += 1;
    };
    document.addEventListener(ready, capture);
    document.addEventListener(layoutComplete, capture);
  }, GraphView.events);
}

/*** Exercise the actual production canvas with publicly measured src and features nodes. */
export async function assertProductionCompoundCanvasAsync(page: Page): Promise<void> {
  await requireBreadcrumbsAsync(page, ['Home']);
  await clickMeasuredNodeAsync(page, 'src', 2);
  await page.getByRole('button', { name: 'Home', exact: true }).waitFor();
  await requireBreadcrumbsAsync(page, ['Home', 'src']);

  const compounds = page.getByRole('switch', { name: 'Show Compound Nodes', exact: true });
  if (!(await isSwitchEnabledAsync(compounds))) await compounds.click();
  if (!(await isSwitchEnabledAsync(compounds)))
    throw new Error('Production GraphView did not enable its compound projection.');

  const depth = page.getByLabel('Subpackage depth', { exact: true });
  await depth.fill('3');
  await readRenderedNodeAsync(page, 'src.features');
  await readRenderedNodeAsync(page, 'src.features.nested');

  const breadcrumbBefore = await readBreadcrumbsAsync(page);
  const viewportBefore = await readPublicViewportAsync(page);
  await clickMeasuredNodeAsync(page, 'src.features', 1);
  await page.getByRole('treeitem', { selected: true, name: /features/iu }).waitFor();

  await requireBreadcrumbsAsync(page, breadcrumbBefore);
  const viewportAfter = await readPublicViewportAsync(page);
  assertSame('real canvas compound press preserves viewport', viewportAfter, viewportBefore);
  await readRenderedNodeAsync(page, 'src.features.nested');
  await saveEvidenceAsync(page, 'production-compound-light.png');

  const graph = page.getByRole('application', { name: 'Graph' });
  const lightBackground = await graph.evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).waitFor();
  const darkBackground = await graph.evaluate((element) => getComputedStyle(element).backgroundColor);
  if (lightBackground === darkBackground)
    throw new Error('Real GraphView background did not respond to dark mode.');
  assertSame('dark mode preserves selection viewport', await readPublicViewportAsync(page), viewportAfter);
  await page.getByRole('treeitem', { selected: true, name: /features/iu }).waitFor();
  await saveEvidenceAsync(page, 'production-compound-dark.png');
}

/*** Press a measured node once or twice using actual public rendered geometry on the real canvas. */
async function clickMeasuredNodeAsync(page: Page, nodeId: string, clickCount: number): Promise<void> {
  const node = await readRenderedNodeAsync(page, nodeId);
  const graph = page.getByRole('application', { name: 'Graph' });
  const box = await graph.boundingBox();
  if (box === null) throw new Error('The real GraphView canvas has no visible bounds.');
  const isCompound = nodeId === 'src.features';
  const position = isCompound
    ? {
        x: node.position.x - node.size.width * 0.4,
        y: node.position.y - node.size.height * 0.4,
      }
    : node.position;
  if (
    position.x <= 0 || position.y <= 0 ||
    position.x >= box.width || position.y >= box.height
  ) throw new Error(`Measured graph node ${nodeId} lies outside its rendered canvas.`);
  await page.mouse.click(box.x + position.x, box.y + position.y, { clickCount });
}

/*** Wait until the released GraphView controller measures the exact requested rendered node. */
async function readRenderedNodeAsync(page: Page, nodeId: string) {
  await page.waitForFunction((id) => {
    const probe = (window as typeof window & { __atlasGraphAcceptance?: BrowserGraphProbe })
      .__atlasGraphAcceptance;
    const result = probe?.controller?.measureNodes?.([id]);
    return result?.nodes.some(
      (node) => node.id === id && node.size.width > 0 && node.size.height > 0
    ) ?? false;
  }, nodeId);
  const measurement = await page.evaluate((id) => {
    const probe = (window as typeof window & { __atlasGraphAcceptance?: BrowserGraphProbe })
      .__atlasGraphAcceptance;
    return probe?.controller?.measureNodes?.([id]) ?? null;
  }, nodeId);
  const node = measurement?.nodes.find((item) => item.id === nodeId);
  if (node === undefined)
    throw new Error(`Public GraphView controller cannot measure production node ${nodeId}.`);
  return node;
}

/*** Observe viewport ownership through the published controller, never a Cytoscape private API. */
async function readPublicViewportAsync(page: Page) {
  const viewport = await page.evaluate(() => {
    const probe = (window as typeof window & { __atlasGraphAcceptance?: BrowserGraphProbe })
      .__atlasGraphAcceptance;
    return probe?.controller?.getViewport() ?? null;
  });
  if (viewport === null) throw new Error('Public GraphView viewport is unavailable.');
  return viewport;
}

/*** Read the same semantic breadcrumb trail used by the existing workspace browser acceptance. */
async function readBreadcrumbsAsync(page: Page): Promise<readonly string[]> {
  const text = await page.getByText('Home', { exact: true }).locator('xpath=../../..').innerText();
  return text
    .split('›')
    .map((part) => part.trim().split('\n').at(-1) ?? '')
    .filter(Boolean);
}

/*** Reject navigation drift with the actual rendered breadcrumb values. */
async function requireBreadcrumbsAsync(page: Page, expected: readonly string[]): Promise<void> {
  const actual = await readBreadcrumbsAsync(page);
  assertSame('workspace breadcrumbs', actual, expected);
}

/*** Observe the existing generated switch semantics without adding an Atlas test hook. */
async function isSwitchEnabledAsync(control: ReturnType<Page['getByRole']>): Promise<boolean> {
  return control.evaluate((element) => {
    const thumb = element.querySelector(':scope > div > div > div');
    return thumb instanceof HTMLElement && thumb.style.alignSelf === 'flex-end';
  });
}

/*** Preserve concrete screenshots for review of real internal and directional graph edges. */
async function saveEvidenceAsync(page: Page, name: string): Promise<void> {
  const destination = resolve('artifacts/browser-acceptance');
  await mkdir(destination, { recursive: true });
  await page.getByRole('application', { name: 'Graph' }).screenshot({
    path: resolve(destination, name),
  });
}

/*** Compare exact browser states to detect unwanted navigation or automatic viewport changes. */
function assertSame(label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
}
