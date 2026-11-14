import { assert, describe, it } from '@artiphishle/testosterone';

import {
  classifyWorkspaceRepositoryFailure,
  workspaceRepositoryFailureDescription,
} from '@/features/workspace/application/use-cases/classifyWorkspaceRepositoryFailure';

describe('[classifyWorkspaceRepositoryFailure]', () => {
  it('classifies observable provider outcomes without returning provider bodies or local paths', () => {
    const cases = [
      [Object.assign(new Error('token=secret /private/tmp'), { status: 401 }), 'authentication'],
      [Object.assign(new Error('token=secret /private/tmp'), { status: 403 }), 'authorization'],
      [Object.assign(new Error('token=secret /private/tmp'), { status: 404 }), 'not-found'],
      [
        Object.assign(new Error('token=secret /private/tmp'), { status: 429 }),
        'primary-rate-limit',
      ],
      [
        Object.assign(new Error('token=secret /private/tmp'), {
          rateLimitKind: 'secondary',
          retryAfterSeconds: 30,
          status: 429,
        }),
        'secondary-rate-limit',
      ],
      [Object.assign(new Error('token=secret /private/tmp'), { status: 503 }), 'upstream'],
      [Object.assign(new Error('token=secret /private/tmp'), { name: 'TimeoutError' }), 'timeout'],
      [Object.assign(new Error('token=secret /private/tmp'), { name: 'SyntaxError' }), 'parsing'],
      [
        Object.assign(new Error('token=secret /private/tmp'), { name: 'ResourceLimitError' }),
        'runtime-limit',
      ],
    ] as const;

    for (const [error, category] of cases) {
      const failure = classifyWorkspaceRepositoryFailure(error);
      assert.equal(failure.category, category);
      assert.equal(workspaceRepositoryFailureDescription(failure).includes('secret'), false);
      assert.equal(workspaceRepositoryFailureDescription(failure).includes('/private'), false);
    }
  });
});
