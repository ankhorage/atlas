'use client';
import { Button } from '@ankhorage/zora/web/button';
import { Select } from '@ankhorage/zora/web/select';
import { useState } from 'react';

import type { RepositoryBranchOptions } from '@/features/workspace/adapters/inbound/react/useProjectSourceFormState';
import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

/*** Lazy-load and select one repository branch without coupling it to selection or color. */
export function RepositoryBranchControl({
  branch,
  options,
  repository,
  source,
  onChange,
  onLoad,
}: Props) {
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  /*** Fetches the current repository's branches once and preserves them in the source form. */
  const load = async () => {
    if (options !== undefined || loading) return;
    setLoading(true);
    setError(undefined);
    try {
      const params = new URLSearchParams({ repositoryId: repository.id, source });
      const response = await fetch(`/api/workspace/branches?${params.toString()}`);
      if (!response.ok) throw new Error('Unable to load branches.');
      const value: unknown = await response.json();
      if (!isBranchResponse(value)) throw new Error('Unable to load branches.');
      onLoad(repository.id, createBranchOptions(value));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load branches.');
    } finally {
      setLoading(false);
    }
  };
  if (options === undefined)
    return (
      <Button size="s" variant="ghost" onPress={() => void load()}>
        {loading ? 'Loading…' : (error ?? 'Branch')}
      </Button>
    );
  if (options.branches.length === 0) return <span role="status">No branches available.</span>;
  return (
    <div style={{ minWidth: '11rem' }}>
      <Select
        options={options.branches.map(value => ({ label: value, value }))}
        placeholder="Select branch"
        testID={`repository-branch-${repository.id}`}
        value={branch ?? options.defaultBranch}
        onValueChange={onChange}
      />
    </div>
  );
}

interface Props {
  readonly branch: string | undefined;
  readonly options: RepositoryBranchOptions | undefined;
  readonly repository: WorkspaceRepositoryOption;
  readonly source: string;
  readonly onChange: (branch: string) => void;
  readonly onLoad: (repositoryId: string, options: RepositoryBranchOptions) => void;
}

/*** Sorts the credential-free API response before it becomes a persistent branch picker cache. */
function createBranchOptions(value: {
  readonly branches: readonly string[];
  readonly repository: { readonly defaultBranch: string };
}): RepositoryBranchOptions {
  return {
    branches: value.branches.toSorted((left, right) => left.localeCompare(right)),
    defaultBranch: value.repository.defaultBranch,
  };
}

/*** Accept only the credential-free branch payload returned by the workspace boundary. */
function isBranchResponse(value: unknown): value is {
  readonly branches: readonly string[];
  readonly repository: { readonly defaultBranch: string };
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'branches' in value &&
    Array.isArray(value.branches) &&
    value.branches.every(branch => typeof branch === 'string') &&
    'repository' in value &&
    typeof value.repository === 'object' &&
    value.repository !== null &&
    'defaultBranch' in value.repository &&
    typeof value.repository.defaultBranch === 'string'
  );
}
