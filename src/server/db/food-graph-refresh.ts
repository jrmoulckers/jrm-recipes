import "server-only";

import { ingestFoodGraph } from "./ingest-food-graph";

/**
 * Live-refresh trigger for the food graph (Phase 2, see `docs/food-graph.md`).
 *
 * Recipe writes call {@link scheduleFoodGraphRefresh} after their transaction
 * commits. Because canonicalization is app-side there is no cheap SQL to scope a
 * per-recipe delta (that would need a `recipe_ingredient → foodId` provenance
 * table — a future optimization), so a save re-runs the idempotent full
 * recompute {@link ingestFoodGraph}. To keep that from thrashing under bursts
 * (bulk import, rapid edits), the runs are **coalesced**: while one recompute is
 * in flight, further triggers set a "dirty" flag that schedules exactly one more
 * pass afterwards. A burst of N saves therefore costs at most two recomputes.
 *
 * The trigger is fire-and-forget and never throws — a graph-maintenance failure
 * must never break the user's save. The nightly full recompute (same job) is the
 * convergence backstop, so a dropped refresh is self-healing.
 */

type CoalescerOptions = {
  /** Invoked when a run rejects; defaults to `console.error`. Never rethrows. */
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

const trigger = createCoalescer(
  async () => {
    await ingestFoodGraph();
  },
  {
    onError: (error) =>
      console.error("[food-graph] live refresh failed", error),
  },
);

/**
 * Ask the food graph to refresh after a recipe write. Safe to call from any
 * server action or mutation once its transaction has committed. Returns
 * synchronously; the recompute runs in the background and swallows its own
 * errors so it can never fail the caller's request.
 */
export function scheduleFoodGraphRefresh(): void {
  try {
    trigger();
  } catch {
    // Defensive: scheduling itself must never surface to a save handler.
  }
}
