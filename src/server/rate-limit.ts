import "server-only";

/**
 * Shared rate-limiting utility (issue #199).
 *
 * The app had no throttling anywhere, so every Server Action and route handler
 * could be hit as fast as an attacker liked — enabling outbound SSRF
 * amplification via URL import, Cloudinary quota/cost abuse via upload signing,
 * write/storage spam via recipe and engagement mutations, and token/slug
 * enumeration. This module provides a small, dependency-free fixed-window
 * limiter keyed by user id (falling back to client IP) with a pluggable store,
 * so the same helper can back an in-memory limiter today and a Redis/Postgres
 * one later without touching call sites.
 *
 * It is **default-safe with zero config**: sane per-action budgets ship built
 * in, and everything is tunable via env (`RATE_LIMIT_DISABLED` to turn it off,
 * `RATE_LIMIT_FACTOR` to scale every budget). When disabled, callers always get
 * an `ok` result, so tests and local dev are never throttled unexpectedly.
 */

/** A single fixed-window budget: at most `limit` hits per `windowMs`. */
export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

/** Outcome of a rate-limit check. Never throws; callers branch on `ok`. */
export interface RateLimitResult {
  ok: boolean;
  limit: number;
  /** Remaining hits in the current window (0 when blocked). */
  remaining: number;
  /** Epoch ms at which the current window resets. */
  resetAt: number;
  /** Seconds until the window resets — suitable for a `Retry-After` header. */
  retryAfterSeconds: number;
}

/**
 * Storage backend for the limiter. Swappable so production can plug in a shared
 * store (Redis/Postgres) without changing any call site. `hit` records one
 * request against `key` under `rule` and reports the resulting state.
 */
export interface RateLimitStore {
  hit(key: string, rule: RateLimitRule, now: number): RateLimitResult;
}

interface WindowState {
  count: number;
  resetAt: number;
}

/**
 * Process-local fixed-window store. Adequate for a single instance and for
 * blunting bursts even across a small fleet; documented as best-effort so a
 * horizontally-scaled deploy can swap in a shared store via {@link setRateLimitStore}.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, WindowState>();
  private lastSweep = 0;

  hit(key: string, rule: RateLimitRule, now: number): RateLimitResult {
    this.sweep(now);
    const existing = this.windows.get(key);
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + rule.windowMs;
      this.windows.set(key, { count: 1, resetAt });
      return {
        ok: true,
        limit: rule.limit,
        remaining: rule.limit - 1,
        resetAt,
        retryAfterSeconds: 0,
      };
    }

    if (existing.count >= rule.limit) {
      return {
        ok: false,
        limit: rule.limit,
        remaining: 0,
        resetAt: existing.resetAt,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      };
    }

    existing.count += 1;
    return {
      ok: true,
      limit: rule.limit,
      remaining: rule.limit - existing.count,
      resetAt: existing.resetAt,
      retryAfterSeconds: 0,
    };
  }

  /** Drop expired windows periodically so the map can't grow without bound. */
  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, state] of this.windows) {
      if (state.resetAt <= now) this.windows.delete(key);
    }
  }

  /** Test-only: forget all recorded windows. */
  reset(): void {
    this.windows.clear();
    this.lastSweep = 0;
  }
}

let store: RateLimitStore = new MemoryRateLimitStore();

/** Swap the backing store (e.g. a Redis-backed one in production). */
export function setRateLimitStore(next: RateLimitStore): void {
  store = next;
}

/**
 * Named per-action budgets. Deliberately generous for legitimate humans while
 * still bounding automated abuse. `import` is the tightest because each hit is a
 * server-side outbound fetch at a third party.
 */
export const RATE_LIMITS = {
  import: { limit: 10, windowMs: 60_000 },
  sign: { limit: 30, windowMs: 60_000 },
  recipeWrite: { limit: 40, windowMs: 60_000 },
  engagementWrite: { limit: 60, windowMs: 60_000 },
  // Full-cookbook backup export (issue #420): builds the whole archive in
  // memory, so keep it modest — a handful of downloads a minute is plenty.
  backup: { limit: 5, windowMs: 60_000 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

function isDisabled(): boolean {
  const flag = process.env.RATE_LIMIT_DISABLED;
  return flag === "1" || flag === "true";
}

/**
 * Global multiplier applied to every budget, so an operator can loosen or
 * tighten all limits at once without redeploying code. Defaults to 1 and is
 * clamped to at least 1 hit so a misconfiguration can't lock everyone out.
 */
function factor(): number {
  const raw = Number(process.env.RATE_LIMIT_FACTOR);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

function scaledRule(rule: RateLimitRule): RateLimitRule {
  const scaled = Math.max(1, Math.floor(rule.limit * factor()));
  return { limit: scaled, windowMs: rule.windowMs };
}

/**
 * Record one request against a named budget for `identifier` (a user id, or an
 * IP for anonymous callers). Returns the resulting {@link RateLimitResult};
 * `ok: false` means the caller is over budget and should be refused. When rate
 * limiting is disabled via env, always resolves to `ok`.
 */
export function checkRateLimit(
  name: RateLimitName,
  identifier: string,
  now: number = Date.now(),
): RateLimitResult {
  const rule = scaledRule(RATE_LIMITS[name]);
  if (isDisabled()) {
    return {
      ok: true,
      limit: rule.limit,
      remaining: rule.limit,
      resetAt: now + rule.windowMs,
      retryAfterSeconds: 0,
    };
  }
  return store.hit(`${name}:${identifier}`, rule, now);
}

/** Friendly, internals-free message shown when a caller is throttled. */
export const RATE_LIMITED_MESSAGE =
  "You're doing that a bit too fast. Please wait a moment and try again.";
