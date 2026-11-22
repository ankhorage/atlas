import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dir, '../..');
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'atlas-packed-offline-'));

try {
  const packageDirectory = join(temporaryDirectory, 'package');
  const consumerDirectory = join(temporaryDirectory, 'consumer');
  const fixtureDirectory = join(temporaryDirectory, 'fixture');
  await runCommandAsync(
    ['bun', 'pm', 'pack', '--ignore-scripts', '--quiet', '--destination', packageDirectory],
    repositoryRoot
  );

  const archivePath = await findArchiveAsync(packageDirectory);
  await Promise.all([mkdir(consumerDirectory), mkdir(fixtureDirectory)]);
  await writeFixtureAsync(fixtureDirectory);
  await writeFile(
    join(consumerDirectory, 'package.json'),
    '{"name":"atlas-packed-offline-consumer","private":true,"version":"0.0.0"}\n'
  );
  await runCommandAsync(['bun', 'add', archivePath, '--ignore-scripts'], consumerDirectory);

  const reportPath = join(consumerDirectory, 'atlas-report.html');
  await runCommandAsync(
    [
      join(consumerDirectory, 'node_modules', '.bin', 'atlas'),
      fixtureDirectory,
      '--offline',
      '--out',
      'atlas-report.html',
    ],
    consumerDirectory
  );

  await assertEmbeddedWorkspaceAssetsAsync(consumerDirectory, reportPath);
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}

/*** Runs one command with inherited diagnostics and fails on its exact exit status. */
async function runCommandAsync(command: string[], cwd: string): Promise<void> {
  const result = await Bun.spawn(command, { cwd, stderr: 'inherit', stdout: 'inherit' }).exited;
  if (result !== 0) throw new Error(`Command failed (${result}): ${command.join(' ')}`);
}

/*** Returns the single npm package archive produced for this acceptance consumer. */
async function findArchiveAsync(directory: string): Promise<string> {
  const archives = (await readdir(directory)).filter(name => name.endsWith('.tgz'));
  if (archives.length !== 1)
    throw new Error(`Expected one package archive, found ${archives.length}.`);
  return join(directory, archives[0]);
}

/*** Creates the smallest analyzable TypeScript project for the installed Atlas binary. */
async function writeFixtureAsync(directory: string): Promise<void> {
  await Bun.write(
    join(directory, 'package.json'),
    '{"name":"atlas-offline-fixture","version":"0.0.0"}\n'
  );
  await Bun.write(join(directory, 'index.ts'), 'export const answer = 42;\n');
}

/*** Verifies that the installed command emitted both release-built workspace assets into its HTML. */
async function assertEmbeddedWorkspaceAssetsAsync(
  consumerDirectory: string,
  reportPath: string
): Promise<void> {
  const packageDirectory = join(consumerDirectory, 'node_modules', '@ankhorage', 'atlas');
  const [report, css, javascript] = await Promise.all([
    readFile(reportPath, 'utf8'),
    readFile(join(packageDirectory, 'offline', 'atlas-workspace.css'), 'utf8'),
    readFile(join(packageDirectory, 'offline', 'atlas-workspace.js'), 'utf8'),
  ]);

  if (
    !report.includes(escapeInlineStyle(css)) ||
    !report.includes(escapeInlineScript(javascript))
  ) {
    throw new Error('Installed Atlas offline report did not embed its packaged workspace assets.');
  }
}

/*** Matches the HTML exporter's stylesheet escaping at the package-consumer boundary. */
function escapeInlineStyle(value: string): string {
  return value.replace(/<\/style/giu, '<\\/style');
}

/*** Matches the HTML exporter's script escaping at the package-consumer boundary. */
function escapeInlineScript(value: string): string {
  return value.replace(/<\/script/giu, '<\\/script');
}
