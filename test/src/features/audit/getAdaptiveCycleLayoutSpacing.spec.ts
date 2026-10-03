import { describe, expect, it } from '@artiphishle/testosterone';

import { getAdaptiveCycleLayoutSpacing } from '@/features/audit/utils/getAdaptiveCycleLayoutSpacing';

describe('[getAdaptiveCycleLayoutSpacing]', () => {
  it('keeps spacing when cycle nodes are already readable', () => {
    expect(
      getAdaptiveCycleLayoutSpacing(1, {
        viewportWidth: 1200,
        viewportHeight: 800,
        cycleWidth: 420,
        cycleHeight: 280,
        averageNodeSize: 36,
        averageNodeDistance: 250,
      })
    ).toBe(1);
  });

  it('keeps spacing when small cycle nodes are already close together', () => {
    expect(
      getAdaptiveCycleLayoutSpacing(0.8, {
        viewportWidth: 1200,
        viewportHeight: 800,
        cycleWidth: 180,
        cycleHeight: 120,
        averageNodeSize: 18,
        averageNodeDistance: 120,
      })
    ).toBe(0.8);
  });

  it('reduces spacing from measured size, distance, and coverage', () => {
    expect(
      getAdaptiveCycleLayoutSpacing(1, {
        viewportWidth: 1200,
        viewportHeight: 800,
        cycleWidth: 900,
        cycleHeight: 540,
        averageNodeSize: 18,
        averageNodeDistance: 420,
      })
    ).toBe(0.6);
  });

  it('never compresses below the conservative floor', () => {
    expect(
      getAdaptiveCycleLayoutSpacing(0.2, {
        viewportWidth: 1200,
        viewportHeight: 800,
        cycleWidth: 1100,
        cycleHeight: 700,
        averageNodeSize: 8,
        averageNodeDistance: 700,
      })
    ).toBe(0.2);
  });
});
