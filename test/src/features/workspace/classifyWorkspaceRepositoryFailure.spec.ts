import { assert, describe, it } from '@artiphishle/testosterone';

import {
  classifyWorkspaceRepositoryFailure,
  workspaceRepositoryFailureDescription,
} from '@/features/workspace/application/use-cases/classifyWorkspaceRepositoryFailure';
import { diagnoseWorkspaceRepositoryOperationAsync } from '@/features/workspace/application/use-cases/diagnoseWorkspaceRepositoryOperationAsync';

describe('[classifyWorkspaceRepositoryFailure]', () => {
  it('classifies observable provider outcomes without returning provider bodies or local paths', () => {
    const cases = [
      [Object.assign(new Error('token=secret /private/tmp'), { status: 401 }), 'authentication'],
      [Object.assign(new Error('token=secret /private/tmp'), { status: 403 }), 'unknown'],
      [Object.assign(new Error('token=secret /private/tmp'), { status: 404 }), 'not-found'],
      [Object.assign(new Error('token=secret /private/tmp'), { status: 429 }), 'rate-limited'],
      [
        Object.assign(new Error('token=secret /private/tmp'), {
          rateLimitKind: 'primary',
          retryAfterSeconds: 86_400,
          status: 403,
        }),
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

  it('keeps an ambiguous 403 neutral and bounds generic rate-limit metadata', () => {
    assert.deepEqual(classifyWorkspaceRepositoryFailure({ status: 403 }), { category: 'unknown' });
    assert.deepEqual(
      classifyWorkspaceRepositoryFailure({ retryAfterSeconds: 86_401, status: 429 }),
      {
        category: 'rate-limited',
      }
    );
  });

  it('keeps Repository rate-limit timing and an Atlas operation stage without exposing its cause', async () => {
    let failure: unknown;
    try {
      await diagnoseWorkspaceRepositoryOperationAsync(
        'bd4cbec4-0e72-467c-a929-242e2385799a',
        'revision',
        async () => {
          throw Object.assign(new Error('token=secret /private/tmp'), {
            code: 'rate-limited',
            retryAfterMilliseconds: 1_500,
          });
        }
      );
    } catch (error) {
      failure = error;
    }
    assert.deepEqual(classifyWorkspaceRepositoryFailure(failure), {
      category: 'rate-limited',
      correlationId: 'bd4cbec4-0e72-467c-a929-242e2385799a',
      retryAfterSeconds: 2,
      stage: 'revision',
    });
  });
});
