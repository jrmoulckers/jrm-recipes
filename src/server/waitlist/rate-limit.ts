/**
 * A tiny, dependency-free sliding-window rate limiter (issue #351).
 *
 * Best-effort, per-process, in-memory — enough to blunt trivial abuse of an
 * unauthenticated endpoint (bursts of submissions) without reaching for Redis.
 * It intentionally does no keying: a signed-out landing form has no trustworthy
 * per-caller identity, so this caps the *global* submission rate as a safety
 * valve while the unique-email index bounds what actually persists. Pure and
 * injectable (`now`) so the windowing logic is unit-testable.
 */
export interface RateLimiter {
  /** Records a hit at `now` and returns true if it's within the limit. */
  hit(now?: number): boolean;
}

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const hits: number[] = [];
  return {
    hit(now = Date.now()) {
      const cutoff = now - windowMs;
      // Drop timestamps that have aged out of the window.
      while (hits.length > 0 && hits[0]! <= cutoff) hits.shift();
      if (hits.length >= limit) return false;
      hits.push(now);
      return true;
    },
  };
}
