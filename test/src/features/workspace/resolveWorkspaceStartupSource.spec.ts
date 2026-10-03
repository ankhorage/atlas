import { assert, describe, it } from '@artiphishle/testosterone';

import { resolveWorkspaceStartupSource } from '@/features/workspace/composition/resolveWorkspaceStartupSource';

describe('[resolveWorkspaceStartupSource]', () => {
  it('prefers an explicit browser source over the configured local project', () => {
    assert.deepEqual(resolveWorkspaceStartupSource('ankhorage/zora', '/workspace/local'), {
      kind: 'github',
      source: 'ankhorage/zora',
    });
  });

  it('uses the configured local project when the browser source is empty', () => {
    assert.deepEqual(resolveWorkspaceStartupSource('  ', '/workspace/local'), {
      kind: 'filesystem',
      path: '/workspace/local',
    });
  });

  it('loads Atlas itself when neither browser source nor project environment is configured', () => {
    assert.deepEqual(resolveWorkspaceStartupSource(undefined, undefined), {
      kind: 'github',
      source: 'ankhorage/atlas',
    });
  });
});
