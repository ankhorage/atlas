/*** Resolve the browser workspace source with query and explicit local-project precedence. */
export function resolveWorkspaceStartupSource(
  sourceValue: string | undefined,
  configuredProjectPath: string | undefined
): WorkspaceStartupSource {
  const source = sourceValue?.trim();
  if (source === 'example:java') return { kind: 'filesystem', path: 'examples/java/my-app' };
  if (source === 'example:typescript')
    return { kind: 'filesystem', path: 'examples/typescript/my-app' };
  if (source !== undefined && source !== '') return { kind: 'github', source };

  const projectPath = configuredProjectPath?.trim();
  if (projectPath !== undefined && projectPath !== '') {
    return { kind: 'filesystem', path: projectPath };
  }

  return { kind: 'empty' };
}

type WorkspaceStartupSource =
  | { readonly kind: 'empty' }
  | { readonly kind: 'filesystem'; readonly path: string }
  | { readonly kind: 'github'; readonly source: string };
