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
    `<div id="root"></div><script src="./${basename(script.path)}"></script>`
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
    await page.getByLabel('Graph geometry').getByText('src.features').waitFor();

    const breadcrumbs = await page.getByLabel('Breadcrumbs').innerText();
    const viewport = await page.getByLabel('Graph viewport').innerText();
    await pressMeasuredNode(page, 'src.features');

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
      'synchronized TreeView selection',
      await page
        .getByRole('treeitem', { name: 'features', exact: true })
        .getAttribute('aria-selected'),
      'true'
    );
    assertPresentation(await page.getByLabel('Graph presentation').innerText());

    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await page.getByRole('button', { name: 'Light', exact: true }).waitFor();
    assertPresentation(await page.getByLabel('Graph presentation').innerText());
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

/*** Presses a real canvas node at the public controller's measured rendered position. */
async function pressMeasuredNode(page: Page, nodeId: string): Promise<void> {
  const position = await readMeasuredNodePosition(page, nodeId);
  await page.getByRole('application', { name: 'Graph' }).click({ position });
}

/*** Reads one canvas-relative node position published by the test-owned public controller harness. */
async function readMeasuredNodePosition(page: Page, nodeId: string) {
  const measurement = JSON.parse(await page.getByLabel('Graph geometry').innerText()) as {
    readonly nodes: readonly {
      readonly id: string;
      readonly position: { readonly x: number; readonly y: number };
    }[];
  } | null;
  const node = measurement?.nodes.find(candidate => candidate.id === nodeId);
  if (node === undefined) throw new Error(`GraphView did not measure ${nodeId}.`);
  return { x: node.position.x, y: node.position.y };
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
    if (nodeClasses.get(nodeId)?.includes('hushed'))
      throw new Error(`Selected compound descendant ${nodeId} is hushed.`);
  }
  for (const edgeId of ['inner-compound', 'inner-descendant']) {
    if (edgeClasses.get(edgeId)?.includes('hushed'))
      throw new Error(`Internal compound edge ${edgeId} is hushed.`);
  }
  assertEqual('incoming edge class', edgeClasses.get('incoming'), 'highlight-incomer');
  assertEqual('outgoing edge class', edgeClasses.get('outgoing'), 'highlight-outgoer');
}

/*** Raises semantic browser evidence instead of relying on assertion-library internals. */
function assertEqual(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected)
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}.`);
}
