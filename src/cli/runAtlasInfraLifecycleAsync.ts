import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { isAppManifest } from '@ankhorage/contracts';
import { createProjectInfraLifecycle, type ProjectInfraLifecycle } from '@ankhorage/infra/project';

/*** Delegate a named Atlas environment operation to the released Infra project lifecycle. */
export async function runAtlasInfraLifecycleAsync(
  operation: AtlasInfraOperation,
  options: AtlasInfraLifecycleOptions = {}
): Promise<AtlasInfraLifecycleResult> {
  const projectPath = options.projectPath ?? process.cwd();
  const manifestPath = resolve(projectPath, 'ankh.config.json');
  const manifest = await readAtlasManifestAsync(manifestPath);
  const lifecycle = createProjectInfraLifecycle();
  const request = {
    projectId: manifest.metadata.slug,
    projectPath,
    manifest: manifest.infra,
    environment: 'local' as const,
  };

  switch (operation) {
    case 'validate':
      return lifecycle.validateAsync(request);
    case 'plan':
      return lifecycle.planAsync(request);
    case 'generate':
      return lifecycle.generateAsync(request);
    case 'up':
      return lifecycle.upAsync(request);
    case 'status':
      return lifecycle.statusAsync(request);
  }
}

/*** Execute a selected Atlas Infra lifecycle operation from the package root. */
async function runAtlasInfraLifecycleCommandAsync(): Promise<void> {
  const operation = parseAtlasInfraOperation(process.argv.slice(2));
  const result = await runAtlasInfraLifecycleAsync(operation);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

/*** Read and validate the one Atlas manifest that owns environment intent. */
async function readAtlasManifestAsync(manifestPath: string) {
  const raw = await readFile(manifestPath, 'utf8');
  const parsed: unknown = JSON.parse(raw);

  if (!isAppManifest(parsed)) {
    throw new Error(`Atlas manifest is invalid: ${manifestPath}`);
  }

  return parsed;
}

/*** Parse the lifecycle operation without accepting implicit or destructive variants. */
function parseAtlasInfraOperation(argv: readonly string[]): AtlasInfraOperation {
  const [operation] = argv;

  if (argv.length === 1 && isAtlasInfraOperation(operation)) return operation;

  throw new Error('Usage: atlas infra <validate|plan|generate|up|status>');
}

/*** Check whether a CLI token names an explicitly supported Atlas Infra lifecycle operation. */
function isAtlasInfraOperation(value: string | undefined): value is AtlasInfraOperation {
  return (
    value === 'validate' ||
    value === 'plan' ||
    value === 'generate' ||
    value === 'up' ||
    value === 'status'
  );
}

interface AtlasInfraLifecycleOptions {
  readonly projectPath?: string;
}

type AtlasInfraLifecycleResult =
  | Awaited<ReturnType<ProjectInfraLifecycle['validateAsync']>>
  | Awaited<ReturnType<ProjectInfraLifecycle['planAsync']>>
  | Awaited<ReturnType<ProjectInfraLifecycle['generateAsync']>>
  | Awaited<ReturnType<ProjectInfraLifecycle['statusAsync']>>;

type AtlasInfraOperation = 'validate' | 'plan' | 'generate' | 'up' | 'status';

if (import.meta.main) void runAtlasInfraLifecycleCommandAsync();
