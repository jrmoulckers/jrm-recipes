import 'server-only';

/**
 * Small run-coalescing utility.
 *
 * It was introduced to bound how often the food graph recomputed when the full
 * {@link import("./ingest-food-graph").ingestFoodGraph} pass was triggered on
 * every recipe write. That per-save trigger opened a large, table-locking
 * transaction inside the user's request and timed saves out (504) on
 * serverless, so the recompute now runs on a scheduled cron
 * (`/api/cron/food-graph`) instead. See that route and `mutations.ts`.
 *
 * The coalescer stays here as a reusable, timer-free primitive: overlapping
 * calls collapse into at most one in-flight run plus one queued pass, so a
 * burst of triggers costs a bounded number of runs. It is pure and
 * deterministically testable (see `food-graph-refresh.test.ts`).
 */

type CoalescerOptions = {
  /** Invoked when a run rejects. Defaults to `console.error`. Never rethrows. */
  onError?: (error: unknown) => void;
};

/**
 * Wrap an async task so overlapping calls collapse into a bounded number of
 * runs: at most one in flight plus one queued. Pure and timer-free so it is
 * deterministically testable. Returns a `schedule()` that resolves immediately.
 */
export function createCoalescer(
  run: () => Promise<void>,
  options: CoalescerOptions = {},
): () => void {
  const onError = options.onError ?? ((e) => console.error(e));
  let running = false;
  let dirty = false;

  async function drain(): Promise<void> {
    running = true;
    try {
      do {
        dirty = false;
        await run();
      } while (dirty);
    } catch (error) {
      onError(error);
    } finally {
      running = false;
    }
  }

  return function schedule(): void {
    if (running) {
      dirty = true;
      return;
    }
    void drain();
  };
}
