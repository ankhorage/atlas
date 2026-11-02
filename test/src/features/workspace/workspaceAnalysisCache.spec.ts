import { assert, describe, it } from '@artiphishle/testosterone';

import { createWorkspaceAnalysisCache } from '@/features/workspace/application/use-cases/createWorkspaceAnalysisCache';

describe('[workspace analysis cache]', () => {
  it('reuses only the same public repository revision and analysis schema', () => {
    const cache = createWorkspaceAnalysisCache<string>(2);
    const revisionOne = {
      authorization: 'anonymous' as const,
      provider: 'github' as const,
      repositoryId: 'R_atlas',
      revision: 'abc',
      schemaVersion: 1,
    };

    cache.setAnalysis(revisionOne, 'first analysis');

    assert.equal(cache.getAnalysis(revisionOne), 'first analysis');
    assert.equal(cache.getAnalysis({ ...revisionOne, revision: 'def' }), undefined);
    assert.equal(cache.getAnalysis({ ...revisionOne, schemaVersion: 2 }), undefined);
  });

  it('keeps discovery independent from analysis and bounds reusable entries', () => {
    const cache = createWorkspaceAnalysisCache<string>(1);
    const first = {
      authorization: 'anonymous' as const,
      provider: 'github' as const,
      repositoryId: 'R_atlas',
      revision: 'abc',
      schemaVersion: 1,
    };
    const second = { ...first, repositoryId: 'R_zora' };

    cache.setDiscovery('github:ankhorage', ['R_atlas', 'R_zora']);
    cache.setAnalysis(first, 'atlas');
    cache.setAnalysis(second, 'zora');

    assert.deepEqual(cache.getDiscovery('github:ankhorage'), ['R_atlas', 'R_zora']);
    assert.equal(cache.getAnalysis(first), undefined);
    assert.equal(cache.getAnalysis(second), 'zora');
  });

  it('invalidates only the explicitly refreshed repository', () => {
    const cache = createWorkspaceAnalysisCache<string>(3);
    const atlas = {
      authorization: 'anonymous' as const,
      provider: 'github' as const,
      repositoryId: 'R_atlas',
      revision: 'abc',
      schemaVersion: 1,
    };
    const zora = { ...atlas, repositoryId: 'R_zora' };
    cache.setAnalysis(atlas, 'atlas');
    cache.setAnalysis(zora, 'zora');

    cache.clearRepository('R_atlas');

    assert.equal(cache.getAnalysis(atlas), undefined);
    assert.equal(cache.getAnalysis(zora), 'zora');
  });
});
