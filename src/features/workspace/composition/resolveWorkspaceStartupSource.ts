import { resolve } from 'node:path';

/*** Resolve the browser workspace source with query, environment, then Atlas self-hosting precedence. */
export function resolveWorkspaceStartupSource(
  sourceValue: string | undefined,
  configuredProjectPath: string | undefined
): WorkspaceStartupSource {
  const source = sourceValue?.trim();
  if (source !== undefined && source !== '') return { kind: 'github', source };

  const projectPath = configuredProjectPath?.trim();
  if (projectPath !== undefined && projectPath !== '') {
    return { kind: 'filesystem', path: projectPath };
  }

  return { kind: 'filesystem', path: DEFAULT_WORKSPACE_PROJECT_PATH };
}

/*** Keep the shipped example available when a deployment has no selected project or mounted workspace. */
const DEFAULT_WORKSPACE_PROJECT_PATH = resolve(process.cwd(), 'examples/typescript/my-app');

type WorkspaceStartupSource =
  | { readonly kind: 'filesystem'; readonly path: string }
  | { readonly kind: 'github'; readonly source: string };
