import { describe, expect, it } from '@artiphishle/testosterone';

import { settleBoundedAsync } from '@/features/workspace/utils/settleBoundedAsync';

describe('[settleBoundedAsync]', () => {
  it('limits a large repository batch while retaining input-order outcomes', async () => {
    let active = 0;
    let maximumActive = 0;
    const outcomes = await settleBoundedAsync(
      Array.from({ length: 72 }, (_, index) => index),
      4,
      async value => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await Promise.resolve();
        active -= 1;
        return value;
      }
    );

    expect(maximumActive).toBe(4);
    expect(outcomes.map(outcome => outcome.status)).toEqual(Array(72).fill('fulfilled'));
    expect(outcomes.at(-1)).toEqual({ status: 'fulfilled', value: 71 });
  });

  it('retains an individual failure without cancelling completed work', async () => {
    const outcomes = await settleBoundedAsync([1, 2, 3], 2, async value => {
      if (value === 2) throw new Error('unavailable');
      return value;
    });

    expect(outcomes.map(outcome => outcome.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
  });

  it('does not start queued repositories after the active workspace is cancelled', async () => {
    const controller = new AbortController();
    const started: number[] = [];
    const outcomes = await settleBoundedAsync(
      [1, 2, 3, 4],
      2,
      async value => {
        started.push(value);
        if (value === 1) controller.abort(new Error('Newer workspace selected.'));
        return value;
      },
      controller.signal
    );

    expect(started).toEqual([1]);
    expect(outcomes.map(outcome => outcome.status)).toEqual([
      'fulfilled',
      'rejected',
      'rejected',
      'rejected',
    ]);
  });
});
