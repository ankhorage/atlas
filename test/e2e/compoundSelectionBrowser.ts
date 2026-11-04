import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium, type Page } from 'playwright-core';

const browserPath = process.env.ATLAS_CHROME;

if (browserPath === undefined)
  throw new Error('ATLAS_CHROME must point to an installed Chrome or Chromium binary.');

const directory = await mkdtemp(resolve(tmpdir(), 'atlas-compound-selection-browser-'));

try {
  const result = await Bun.build({
    entrypoints: [resolve(import.meta.dir, 'compoundSelectionHarness.tsx')],
    outdir: directory,
    target: 'browser',
  });
  if (!result.success) throw new Error(result.logs.map(log => log.message).join('\n'));

  const script = result.outputs.find(output => output.path.endsWith('.js'));
  if (script === undefined)
    throw new Error('The compound selection harness did not emit a browser script.');
  const documentPath = resolve(directory, 'index.html');
  await writeFile(
    documentPath,
    `<meta charset="utf-8"><div id="root"></div><script src="./${basename(script.path)}"></script>`
  );

  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const runtimeDiagnostics: string[] = [];
    page.on('pageerror', error => runtimeDiagnostics.push(`pageerror:${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error') runtimeDiagnostics.push(`console:${message.text()}`);
    });
    await page.goto(pathToFileURL(documentPath).href, { waitUntil: 'networkidle' });
    await page
      .getByRole('application', { name: 'Graph' })
      .waitFor()
      .catch(async () => {
        throw new Error(
          `GraphView did not render: ${runtimeDiagnostics.join(' | ')} ${await page.locator('body').innerText()}`
        );
      });

    assertEqual(
      'initial package scope',
      await page.getByLabel('Breadcrumbs').innerText(),
      'Home › src'
    );
    await page.getByRole('switch', { name: 'Show Compound Nodes' }).click();
    await page.getByTestId('graph-node-src.features').waitFor();
    const visibleLayout = await waitForNextGraphLayout(page, 0);

    const breadcrumbs = await page.getByLabel('Breadcrumbs').innerText();
    const viewport = JSON.stringify(visibleLayout.viewport);
    await page.getByTestId('graph-node-src.features').click();
    const selectedLayout = await waitForNextGraphLayout(page, visibleLayout.layoutSequence);

    assertEqual(
      'breadcrumbs after GraphView selection',
      await page.getByLabel('Breadcrumbs').innerText(),
      breadcrumbs
    );
    assertEqual(
      'viewport after GraphView selection',
      await page.getByLabel('Graph viewport').innerText(),
      viewport
    );
    assertEqual(
      'selection did not change the settled GraphView viewport',
      selectedLayout.viewport,
      visibleLayout.viewport
    );
    assertEqual(
      'selection did not change graph container dimensions',
      selectedLayout.container,
      visibleLayout.container
    );
    assertEqual(
      'selection retained the compound visibility state',
      selectedLayout.showCompoundNodes,
      true
    );
    assertEqual('selection state after GraphView selection', selectedLayout.selectedNodeIds, [
      'src.features',
    ]);
    assertEqual(
      'synchronized TreeView selection',
      await page
        .getByRole('treeitem', { name: 'features', exact: true })
        .getAttribute('aria-selected'),
      'true'
    );
    assertPresentation(await page.getByLabel('Graph presentation').innerText());
    await assertRenderedTheme(page, '#ffffff', '#111827');

    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await page.getByRole('button', { name: 'Light', exact: true }).waitFor();
    assertPresentation(await page.getByLabel('Graph presentation').innerText());
    await assertRenderedTheme(page, '#111827', '#f9fafb');
    await page.screenshot({
      path: resolve(directory, 'compound-selection-dark.png'),
      fullPage: true,
    });
  } finally {
    await browser.close();
  }
} finally {
  await rm(directory, { force: true, recursive: true });
}

/*** Verifies the selected compound's readable subtree and directional external dependencies. */
function assertPresentation(serialized: string): void {
  const presentation = JSON.parse(serialized) as {
    readonly nodes: readonly [string, string | undefined][];
    readonly edges: readonly [string | undefined, string | undefined][];
  };
  const nodeClasses = new Map(presentation.nodes);
  const edgeClasses = new Map(presentation.edges);
  for (const nodeId of ['src.features', 'src.features.nested', 'src.features.nested.feature']) {
    assertIncludes(`selected compound node ${nodeId}`, nodeClasses.get(nodeId), 'highlight');
  }
  for (const edgeId of ['inner-compound', 'inner-descendant']) {
    assertIncludes(`internal compound edge ${edgeId}`, edgeClasses.get(edgeId), 'highlight');
  }
  assertEqual('incoming edge class', edgeClasses.get('incoming'), 'highlight-incomer');
  assertEqual('outgoing edge class', edgeClasses.get('outgoing'), 'highlight-outgoer');
}

/*** Reads browser-computed graph and text colors in each rendered theme. */
async function assertRenderedTheme(page: Page, expectedBackground: string, expectedText: string) {
  const graph = page.getByRole('application', { name: 'Graph' });
  const node = page.getByTestId('graph-node-src.features');
  const [background, color] = await Promise.all([
    graph.evaluate(element => getComputedStyle(element).backgroundColor),
    node.evaluate(element => getComputedStyle(element).color),
  ]);
  assertEqual('rendered graph background', background, toRgb(expectedBackground));
  assertEqual('rendered node label color', color, toRgb(expectedText));
}

/*** Requires the observable class instead of accepting missing graph elements as readable. */
function assertIncludes(label: string, actual: string | undefined, expected: string): void {
  if (!actual?.split(' ').includes(expected))
    throw new Error(`${label}: expected class ${expected}, received ${actual ?? 'missing'}.`);
}

/*** Converts the fixed harness palette to the browser's computed rgb representation. */
function toRgb(value: string): string {
  const parsed = Number.parseInt(value.slice(1), 16);
  return `rgb(${(parsed >> 16) & 255}, ${(parsed >> 8) & 255}, ${parsed & 255})`;
}

/*** Raises semantic browser evidence instead of relying on assertion-library internals. */
function assertEqual(label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`
    );
}

/*** Waits for GraphView's published layout completion snapshot instead of sampling an active transition. */
async function waitForNextGraphLayout(
  page: Page,
  previousSequence: number
): Promise<GraphLifecycle> {
  await page
    .getByLabel('Graph lifecycle')
    .filter({ hasText: /"layoutSequence":/u })
    .waitFor();
  await page.waitForFunction(previous => {
    const serialized = document.querySelector('[aria-label="Graph lifecycle"]')?.textContent;
    if (serialized === null || serialized === undefined) return false;
    const lifecycle = JSON.parse(serialized) as GraphLifecycle;
    return lifecycle.layoutSequence > previous && lifecycle.viewport !== null;
  }, previousSequence);
  return JSON.parse(await page.getByLabel('Graph lifecycle').innerText()) as GraphLifecycle;
}

interface GraphLifecycle {
  readonly container: { readonly height: number; readonly width: number };
  readonly layoutSequence: number;
  readonly selectedNodeIds: readonly string[];
  readonly showCompoundNodes: boolean;
  readonly viewport: {
    readonly pan: { readonly x: number; readonly y: number };
    readonly zoom: number;
  } | null;
}
