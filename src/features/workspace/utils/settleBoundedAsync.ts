/*** Settle asynchronous work with a fixed upper bound while retaining one deterministic outcome per input. */
export async function settleBoundedAsync<Input, Output>(
  inputs: readonly Input[],
  concurrency: number,
  operation: (input: Input, signal: AbortSignal | undefined) => Promise<Output>,
  signal?: AbortSignal
): Promise<readonly PromiseSettledResult<Output>[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1)
    throw new Error('Concurrency must be a positive integer.');
  const queue = inputs.map((input, index) => ({ input, index }));
  const workerOutcomes = await Promise.all(
    Array.from({ length: Math.min(concurrency, inputs.length) }, async () => {
      const outcomes: {
        readonly index: number;
        readonly outcome: PromiseSettledResult<Output>;
      }[] = [];
      for (;;) {
        const next = queue.shift();
        if (next === undefined) return outcomes;
        if (signal?.aborted) {
          outcomes.push({
            index: next.index,
            outcome: { status: 'rejected', reason: getAbortReason(signal) },
          });
          continue;
        }
        try {
          outcomes.push({
            index: next.index,
            outcome: { status: 'fulfilled', value: await operation(next.input, signal) },
          });
        } catch (reason) {
          outcomes.push({ index: next.index, outcome: { status: 'rejected', reason } });
        }
      }
    })
  );
  return workerOutcomes
    .flat()
    .sort((left, right) => left.index - right.index)
    .map(result => result.outcome);
}

/*** Preserve the cancelling workspace's reason for work that never started. */
function getAbortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The workspace request was cancelled.', 'AbortError');
}
