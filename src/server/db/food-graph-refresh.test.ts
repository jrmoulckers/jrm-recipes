import { describe, expect, it, vi } from 'vitest';

import { createCoalescer } from './food-graph-refresh';

/** A promise whose resolve/reject are exposed, to drive run timing by hand. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createCoalescer', () => {
  it('runs the task once for a single schedule', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const schedule = createCoalescer(run);

    schedule();
    // schedule() returns synchronously. Let the microtask run.
    await Promise.resolve();
    await Promise.resolve();

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('collapses a burst during an in-flight run into exactly one extra run', async () => {
    const gates = [deferred(), deferred(), deferred()];
    let call = 0;
    const run = vi.fn().mockImplementation(() => gates[call++]!.promise);
    const schedule = createCoalescer(run);

    // Kick off the first run. It is now in flight (gate not resolved).
    schedule();
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);

    // Five more triggers while the first run is in flight collapse to one.
    schedule();
    schedule();
    schedule();
    schedule();
    schedule();
    expect(run).toHaveBeenCalledTimes(1);

    // Finish the first run → the queued (dirty) pass starts.
    gates[0]!.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(2);

    // Nothing was scheduled during the second run → it drains and stops.
    gates[1]!.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('starts a fresh run when scheduled after the queue has drained', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const schedule = createCoalescer(run);

    schedule();
    await Promise.resolve();
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);

    schedule();
    await Promise.resolve();
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('routes a rejected run to onError and keeps accepting new work', async () => {
    const onError = vi.fn();
    const run = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined);
    const schedule = createCoalescer(run, { onError });

    schedule();
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]![0] as Error).message).toBe('boom');

    // A failure must not wedge the scheduler. The next trigger still runs.
    schedule();
    await Promise.resolve();
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(2);
  });
});
