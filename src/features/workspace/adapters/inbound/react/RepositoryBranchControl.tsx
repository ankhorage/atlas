'use client';
import { Button } from '@ankhorage/zora/web/button';
import { Select } from '@ankhorage/zora/web/select';
import { useState } from 'react';

import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';

/*** Lazy-load and select one repository branch without coupling it to selection or color. */
export function RepositoryBranchControl({ branch, repository, source, onChange }: Props) {
  const [branches, setBranches] = useState<readonly string[] | undefined>();
  const [defaultBranch, setDefaultBranch] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const load = async () => {
    if (branches !== undefined || loading) return;
    setLoading(true);
    setError(undefined);
    try {
      const params = new URLSearchParams({ repositoryId: repository.id, source });
      const response = await fetch(`/api/workspace/branches?${params.toString()}`);
      if (!response.ok) throw new Error('Unable to load branches.');
      const value: unknown = await response.json();
      if (!isBranchResponse(value)) throw new Error('Unable to load branches.');
      setBranches(value.branches);
      setDefaultBranch(value.repository.defaultBranch);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load branches.');
    } finally {
      setLoading(false);
    }
  };
  if (branches === undefined)
    return (
      <Button size="s" variant="ghost" onPress={() => void load()}>
        {loading ? 'Loading…' : (error ?? 'Branch')}
      </Button>
    );
  if (branches.length === 0) return <span role="status">No branches available.</span>;
  return (
    <Select
      options={branches.map(value => ({ label: value, value }))}
      value={branch ?? defaultBranch ?? ''}
      onValueChange={onChange}
    />
  );
}

interface Props {
  readonly branch: string | undefined;
  readonly repository: WorkspaceRepositoryOption;
  readonly source: string;
  readonly onChange: (branch: string) => void;
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
