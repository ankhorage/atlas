import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';
import type {
  WorkspaceDefinition,
  WorkspacePresentationSettings,
  WorkspaceSource,
} from '@/types/workspace';

/*** Builds a safe, versioned workspace description from the staged source selection. */
export function createWorkspaceDefinition(
  input: CreateWorkspaceDefinitionInput
): WorkspaceDefinition | null {
  const sources = createWorkspaceSources(input.source, input.repositories, input.selectedIds);
  return sources.length === 0
    ? null
    : { version: 1, id: input.id, name: input.name, sources, settings: input.settings };
}

/*** Preserve owner exclusions and direct repository URLs as separate persisted source policies. */
function createWorkspaceSources(
  source: string,
  repositories: readonly WorkspaceRepositoryOption[] | undefined,
  selectedIds: ReadonlySet<string>
): readonly WorkspaceSource[] {
  return source
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
    .flatMap((value): readonly WorkspaceSource[] => {
      const url = normalizeRepositoryUrl(value);
      if (url !== null) {
        const repository = repositories?.find(candidate => candidate.url === url);
        return [{ kind: 'github-repository', repositoryId: repository?.id ?? `url:${url}`, url }];
      }
      const owner = normalizeOwner(value);
      return owner === null
        ? []
        : [
            {
              kind: 'github-owner',
              owner,
              excludedRepositoryIds: (repositories ?? [])
                .filter(repository => !selectedIds.has(repository.id))
                .map(repository => repository.id),
            },
          ];
    });
}

/*** Return a credential-free canonical repository URL or reject the value as an owner candidate. */
function normalizeRepositoryUrl(value: string): string | null {
  try {
    const url = new URL(value.startsWith('github.com/') ? `https://${value}` : value);
    return url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      url.username === '' &&
      url.password === '' &&
      /^\/[\w.-]+\/[\w.-]+\/?$/u.test(url.pathname)
      ? `https://github.com${url.pathname.replace(/\/$/u, '')}`
      : null;
  } catch {
    return null;
  }
}

/*** Normalize owner forms accepted by Repository discovery without admitting URL path state. */
function normalizeOwner(value: string): string | null {
  const owner = value
    .replace(/^@/u, '')
    .replace(/^https:\/\/github\.com\//u, '')
    .replace(/^github\.com\//u, '');
  return /^[A-Za-z\d](?:[A-Za-z\d-]{0,37}[A-Za-z\d])?$/u.test(owner) ? owner : null;
}

interface CreateWorkspaceDefinitionInput {
  readonly id: string;
  readonly name: string;
  readonly repositories?: readonly WorkspaceRepositoryOption[];
  readonly selectedIds: ReadonlySet<string>;
  readonly settings: WorkspacePresentationSettings;
  readonly source: string;
}
