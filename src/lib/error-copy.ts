/**
 * Friendly, content-owned error copy for user-facing toasts (#135).
 *
 * Server actions return `{ ok: false, error: string }`, and most of those
 * strings are already mapped to warm copy by `messageForError` on the server.
 * But a few paths can still surface developer-flavored text to a warm consumer
 * app: a bare error code that skipped the server mapper, an unexpected internal
 * message, or an empty string. `friendlyError` is the last line of defense the
 * client renders. It maps a small set of known codes to human copy, passes
 * through strings that already read like a sentence, and falls back to a calm,
 * blameless default for anything unmapped. It never returns an empty string.
 *
 * Keep this module client-safe (no `server-only` imports) so any component can
 * route its error toasts through it.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';

/** Warm, blameless default shown when we can't map the error to anything better. */
export const DEFAULT_ERROR_COPY = "That didn't go through. Please try again.";

/**
 * Known error codes/strings mapped to human, action-oriented copy. Keys are
 * matched case-insensitively against the incoming string, so both a raw
 * `RATE_LIMITED` code and any accidental lowercase variant resolve the same way.
 */
const ERROR_COPY = {
  NOT_AUTHENTICATED: 'Please sign in to do that.',
  UNAUTHENTICATED: 'Please sign in to do that.',
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "We couldn't find that.",
  RATE_LIMITED: "You're going a little fast. Try again in a moment.",
  TOO_MANY_REQUESTS: "You're going a little fast. Try again in a moment.",
  NETWORK: 'You seem to be offline. Check your connection and try again.',
  NETWORK_ERROR: 'You seem to be offline. Check your connection and try again.',
  TIMEOUT: 'That took too long. Please try again.',
  CONFLICT: "That change couldn't be completed. Please refresh and try again.",
  INTERNAL: DEFAULT_ERROR_COPY,
  INTERNAL_ERROR: DEFAULT_ERROR_COPY,
  UNKNOWN: DEFAULT_ERROR_COPY,
} as const;

type ErrorCopyCode = keyof typeof ERROR_COPY;

/** True for a bare, developer-flavored code (e.g. `RATE_LIMITED`, `E_NOENT`). */
function looksLikeRawCode(value: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(value);
}

function rawErrorMessage(error: unknown): string {
  return typeof error === 'string' ? error : error instanceof Error ? error.message : '';
}

function knownErrorCode(value: string): ErrorCopyCode | null {
  const direct = value as ErrorCopyCode;
  if (direct in ERROR_COPY) return direct;
  const upper = value.toUpperCase() as ErrorCopyCode;
  return upper in ERROR_COPY ? upper : null;
}

function safeFallback(fallback: string | undefined, defaultCopy: string): string {
  return fallback && fallback.trim().length > 0 ? fallback : defaultCopy;
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
export function friendlyError(error: unknown, fallback: string = DEFAULT_ERROR_COPY): string {
  const safeFallbackCopy = safeFallback(fallback, DEFAULT_ERROR_COPY);

  const trimmed = rawErrorMessage(error).trim();
  if (trimmed.length === 0) return safeFallbackCopy;

  const code = knownErrorCode(trimmed);
  if (code) return ERROR_COPY[code];

  // An unmapped, code-shaped string is developer-flavored. Never leak it.
  if (looksLikeRawCode(trimmed)) return safeFallbackCopy;

  return trimmed;
}

/**
 * Client-side localized companion to `friendlyError`.
 *
 * The pure function above keeps its existing signature and English behavior for
 * server actions, utilities, and tests. React callers can use this hook to
 * resolve the fixed code map through the `errors` catalog while still passing
 * through server-returned prose unchanged.
 */
export function useFriendlyError(): (error: unknown, fallback?: string) => string {
  const t = useTranslations('errors');

  return React.useCallback(
    (error: unknown, fallback?: string) => {
      const localizedDefault = t('default');
      const safeFallbackCopy = safeFallback(fallback, localizedDefault);
      const trimmed = rawErrorMessage(error).trim();
      if (trimmed.length === 0) return safeFallbackCopy;

      const code = knownErrorCode(trimmed);
      if (code) return t(code);

      if (looksLikeRawCode(trimmed)) return safeFallbackCopy;

      return trimmed;
    },
    [t],
  );
}
