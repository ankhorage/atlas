import { assert, describe, it } from '@artiphishle/testosterone';

import {
  isWorkspaceSelectionSource,
  normalizeWorkspaceSelectionSource,
} from '@/features/workspace/application/use-cases/isWorkspaceSelectionSource';

describe('[workspace selection source]', () => {
  it('accepts one owner or @me and rejects every persisted multi-source form', () => {
    assert.equal(isWorkspaceSelectionSource('owner-a'), true);
    assert.equal(isWorkspaceSelectionSource('@me'), true);
    assert.equal(isWorkspaceSelectionSource('owner-a,owner-b'), false);
    assert.equal(isWorkspaceSelectionSource('owner-a|exclude=repository-a'), false);
    assert.equal(isWorkspaceSelectionSource('https://github.com/owner-a/catalog'), false);
  });

  it('uses one normalized owner identity for client and server scope keys', () => {
    assert.equal(normalizeWorkspaceSelectionSource('Owner-A'), 'owner-a');
    assert.equal(normalizeWorkspaceSelectionSource('@me'), '@me');
  });
});
