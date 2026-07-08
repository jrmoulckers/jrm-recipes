/**
 * Friendly, content-owned error copy for user-facing toasts (#135).
 *
 * Server actions return `{ ok: false, error: string }`, and most of those
 * strings are already mapped to warm copy by `messageForError` on the server.
 * But a few paths can still surface developer-flavored text to a warm consumer
 * app: a bare error code that skipped the server mapper, an unexpected internal
 * message, or an empty string. `friendlyError` is the last line of defense the
 * client renders — it maps a small set of known codes to human copy, passes
 * through strings that already read like a sentence, and falls back to a calm,
 * blameless default for anything unmapped. It never returns an empty string.
 *
 * Keep this module client-safe (no `server-only` imports) so any component can
 * route its error toasts through it.
 */

/** Warm, blameless default shown when we can't map the error to anything better. */
export const DEFAULT_ERROR_COPY = "That didn't go through. Please try again.";

/**
 * Known error codes/strings mapped to human, action-oriented copy. Keys are
 * matched case-insensitively against the incoming string, so both a raw
 * `RATE_LIMITED` code and any accidental lowercase variant resolve the same way.
 */
const ERROR_COPY: Record<string, string> = {
  NOT_AUTHENTICATED: "Please sign in to do that.",
  UNAUTHENTICATED: "Please sign in to do that.",
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "We couldn't find that.",
  RATE_LIMITED: "You're going a little fast — try again in a moment.",
  TOO_MANY_REQUESTS: "You're going a little fast — try again in a moment.",
  NETWORK: "You seem to be offline. Check your connection and try again.",
  NETWORK_ERROR: "You seem to be offline. Check your connection and try again.",
  TIMEOUT: "That took too long. Please try again.",
  CONFLICT: "That change couldn't be completed. Please refresh and try again.",
  INTERNAL: DEFAULT_ERROR_COPY,
  INTERNAL_ERROR: DEFAULT_ERROR_COPY,
  UNKNOWN: DEFAULT_ERROR_COPY,
};

/** True for a bare, developer-flavored code (e.g. `RATE_LIMITED`, `E_NOENT`). */
function looksLikeRawCode(value: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(value);
}

/**
 * Turn any thrown/returned error into calm, user-facing copy.
 *
 * - A known code (in any case) maps to its friendly sentence.
 * - An already-friendly message (contains spaces / lower-case words) passes
 *   through unchanged.
 * - An unmapped bare code, empty string, or non-string resolves to `fallback`.
 * - Never returns an empty string.
 */
export function friendlyError(
  error: unknown,
  fallback: string = DEFAULT_ERROR_COPY,
): string {
  const safeFallback = fallback.trim().length > 0 ? fallback : DEFAULT_ERROR_COPY;

  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";

  const trimmed = raw.trim();
  if (trimmed.length === 0) return safeFallback;

  const mapped = ERROR_COPY[trimmed] ?? ERROR_COPY[trimmed.toUpperCase()];
  if (mapped) return mapped;

  // An unmapped, code-shaped string is developer-flavored — never leak it.
  if (looksLikeRawCode(trimmed)) return safeFallback;

  return trimmed;
}
