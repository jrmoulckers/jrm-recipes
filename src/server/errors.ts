import "server-only";

/**
 * Typed domain errors and the single user-message mapper (#168).
 *
 * Mutations used to throw bare string-coded `Error`s (`"FORBIDDEN"`,
 * `"NOT_FOUND"`, …) and every `actions.ts` module re-implemented its own
 * translation (`messageFor`/`errorCode` + inline `if (code === …)` checks). The
 * codes were untyped magic strings shared implicitly between the throw site and
 * the catch site, so a typo silently fell through to a generic message.
 *
 * Now mutations throw a {@link DomainError} carrying a typed {@link DomainCode},
 * and actions translate it through the single {@link messageForError} mapper.
 * {@link DEFAULT_MESSAGES} is an exhaustive `Record<DomainCode, string>`, so
 * adding a code to the union without giving it a default is a compile error.
 */

/** Every domain error code thrown across recipes, groups, and engagement. */
export const DOMAIN_CODES = [
  "NOT_FOUND",
  "FORBIDDEN",
  "CONFLICT",
  "INVALID",
  "UNAUTHENTICATED",
  "USER_NOT_FOUND",
  "ALREADY_MEMBER",
  "ALREADY_INVITED",
  "ALREADY_ACCEPTED",
  "NOT_PENDING",
  "OWNER_CANT_LEAVE",
  "SEAT_LIMIT_REACHED",
  "REVOKED",
  "EXPIRED",
  "EXHAUSTED",
  "SELF_RATING",
  "ALREADY_APPLIED",
  "BAD_SNAPSHOT",
] as const;

/** A typed domain error code. */
export type DomainCode = (typeof DOMAIN_CODES)[number];

const CODE_SET: ReadonlySet<string> = new Set(DOMAIN_CODES);

/** Type guard: is this string one of the known domain codes? */
export function isDomainCode(value: unknown): value is DomainCode {
  return typeof value === "string" && CODE_SET.has(value);
}

/**
 * A thrown domain error. The `message` is set to the code so existing
 * message-based assertions (and any un-migrated `error.message === …` checks)
 * keep working, while `code` gives a typed, exhaustively-checkable handle.
 */
export class DomainError extends Error {
  readonly code: DomainCode;
  constructor(code: DomainCode) {
    super(code);
    this.name = "DomainError";
    this.code = code;
  }
}

/** Throw a typed domain error (shorthand for `throw new DomainError(code)`). */
export function raise(code: DomainCode): never {
  throw new DomainError(code);
}

/**
 * Resolve the domain code carried by an error, whether it's a {@link DomainError}
 * or a legacy `Error` whose message is a code. Returns `null` for anything else.
 */
export function domainCodeOf(error: unknown): DomainCode | null {
  if (error instanceof DomainError) return error.code;
  if (error instanceof Error && isDomainCode(error.message)) return error.message;
  return null;
}

/** Per-call overrides so a caller can tailor copy for a specific code. */
export type DomainMessages = Partial<Record<DomainCode, string>>;

const GENERIC_FALLBACK = "Something went wrong. Please try again.";

/**
 * Generic, exhaustive default copy for every code — the single source of truth.
 * Because it's a `Record<DomainCode, string>`, adding a code to
 * {@link DOMAIN_CODES} without a default fails `tsc`.
 */
export const DEFAULT_MESSAGES: Record<DomainCode, string> = {
  NOT_FOUND: "We couldn't find that.",
  FORBIDDEN: "You don't have permission to do that.",
  CONFLICT: "That change couldn't be completed. Please refresh and try again.",
  INVALID: "That doesn't look right. Please check and try again.",
  UNAUTHENTICATED: "Please sign in to continue.",
  USER_NOT_FOUND:
    "No cook found with that handle or email — ask them to sign up first.",
  ALREADY_MEMBER: "They're already in this group.",
  ALREADY_INVITED: "They've already been invited.",
  ALREADY_ACCEPTED: "That invitation was already accepted.",
  NOT_PENDING: "That invitation is no longer pending.",
  OWNER_CANT_LEAVE: "Transfer ownership or delete the group first.",
  SEAT_LIMIT_REACHED: "This group is full for its current plan.",
  REVOKED: "This invite link has been turned off. Ask for a fresh one.",
  EXPIRED: "This invite link has expired. Ask for a fresh one.",
  EXHAUSTED: "This invite link has reached its limit. Ask for a fresh one.",
  SELF_RATING: "You can't rate your own recipe.",
  ALREADY_APPLIED: "That suggestion was already applied.",
  BAD_SNAPSHOT: "That saved version can't be restored.",
};

/**
 * Map any thrown error to a user-facing message.
 *
 * - Unknown (non-domain) errors resolve to `fallback` (or a generic message).
 * - A known code prefers a per-call `overrides` entry, then `fallback`, then the
 *   exhaustive {@link DEFAULT_MESSAGES}. This lets each action preserve its exact
 *   context-specific copy (e.g. engagement's per-action `FORBIDDEN` text) while
 *   still routing through one mapper.
 */
export function messageForError(
  error: unknown,
  overrides: DomainMessages = {},
  fallback?: string,
): string {
  const code = domainCodeOf(error);
  if (code === null) return fallback ?? GENERIC_FALLBACK;
  return overrides[code] ?? fallback ?? DEFAULT_MESSAGES[code];
}
