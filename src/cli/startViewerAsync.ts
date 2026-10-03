import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as net from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openBrowser, stopProcess } from '@ankhorage/utility/node/process';

import type { PkgvizCliOptions } from '@/types/cli';

/*** Starts the packaged Next viewer and owns its browser and child-process lifecycle. */
export async function startViewerAsync(
  callerRoot: string,
  options: PkgvizCliOptions,
  cleanupAsync: () => Promise<void> = () => Promise.resolve()
): Promise<void> {
  const port = await findFreePortAsync(options.port);
  const packageRoot = resolvePackageRoot();
  const nextBin = resolveNextBin(packageRoot);
  const hasBuild = existsSync(resolve(packageRoot, '.next'));
  const mode = options.prod || hasBuild ? 'start' : 'dev';
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NEXT_PUBLIC_PROJECT_PATH: callerRoot,
    PORT: String(port),
    NEXT_TELEMETRY_DISABLED: '1',
    NODE_ENV: mode === 'start' ? 'production' : 'development',
  };

  logVerbose(options.verbose, `Starting Next (${mode}) at ${packageRoot} on :${port}`);
  const child = spawn(nextBin, [mode, '-p', String(port)], {
    cwd: packageRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  pipeViewerOutput(child, options.verbose);

  const baseUrl = `http://localhost:${port}`;
  await delayAsync(2_000);
  openBrowser(`${baseUrl}/?cwd=${encodeURIComponent(callerRoot)}`);

  if (options.serve) {
    child.once('exit', () => {
      void cleanupAsync();
    });
    console.log(`Serving UI at ${baseUrl} (NEXT_PUBLIC_PROJECT_PATH=${callerRoot})`);
    return;
  }

  await delayAsync(1_000);
  stopProcess(child, 'SIGTERM');
  await delayAsync(800);
  stopProcess(child, 'SIGKILL');
  await cleanupAsync();
}

/*** Finds the first available preferred or conventional viewer port. */
async function findFreePortAsync(preferred?: number): Promise<number> {
  const candidates = [...new Set([preferred, 3000, 3001, 3030, 4000, 5173, 8787, 0])].filter(
    (port): port is number => port !== undefined
  );
  const port = await findAvailablePortAsync(candidates);
  if (port === null) throw new Error('No free port found');
  return port;
}

/*** Checks candidate ports in order and returns the first actual listening port. */
async function findAvailablePortAsync(candidates: readonly number[]): Promise<number | null> {
  if (candidates.length === 0) return null;

  const [candidate] = candidates;
  const port = await claimAvailablePortAsync(candidate);
  return port ?? findAvailablePortAsync(candidates.slice(1));
}

/*** Temporarily binds one port and returns its actual assigned value when available. */
async function claimAvailablePortAsync(port: number): Promise<number | null> {
  return new Promise(resolvePort => {
    const server = net.createServer();
    server.once('error', () => resolvePort(null));
    server.listen(port, () => {
      const address = server.address();
      const resolvedPort = typeof address === 'object' && address !== null ? address.port : port;
      server.close(() => resolvePort(resolvedPort));
    });
  });
}

/*** Resolves the installed PKGViz package root from this CLI module. */
function resolvePackageRoot(): string {
  const here = fileURLToPath(new URL(import.meta.url));
  return resolve(dirname(here), '../..');
}

/*** Resolves the packaged Next executable with a PATH fallback. */
function resolveNextBin(packageRoot: string): string {
  const local = resolve(
    packageRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'next.cmd' : 'next'
  );
  return existsSync(local) ? local : 'next';
}

/*** Pipes viewer output only when verbose CLI logging is enabled. */
function pipeViewerOutput(child: ReturnType<typeof spawn>, verbose: boolean): void {
  if (!verbose) return;
  child.stdout?.on('data', (data: unknown) => writeProcessOutput(process.stdout, data));
  child.stderr?.on('data', (data: unknown) => writeProcessOutput(process.stderr, data));
}

/*** Writes one safely narrowed child-process output chunk. */
function writeProcessOutput(stream: NodeJS.WriteStream, data: unknown): void {
  if (typeof data === 'string' || data instanceof Uint8Array) stream.write(data);
}

/*** Emits one verbose PKGViz CLI line when requested. */
function logVerbose(verbose: boolean, message: string): void {
  if (verbose) console.log('[pkgviz]', message);
}

/*** Waits for a bounded CLI lifecycle delay. */
async function delayAsync(milliseconds: number): Promise<void> {
  await new Promise<void>(resolveDelay => setTimeout(resolveDelay, milliseconds));
}
