import type { ZodError } from "zod";

/**
 * Shared Server Action result contract (#161).
 *
 * Every per-domain `actions.ts` module used to hand-roll its own
 * `{ ok: true; … } | { ok: false; error; fieldErrors? }` union, and every client
 * re-implemented the same `if (res.ok) … else setErrors(res.fieldErrors)` branch
 * against a slightly different shape. This is the single source of truth for that
 * contract.
 *
 * Success payload `T` is merged at the **top level** (`{ ok: true } & T`) rather
 * than nested under a `data` key, so existing clients that read `res.slug` /
 * `res.id` keep compiling unchanged — the historical, backwards-compatible shape
 * the app already depends on. Use `ActionResult<void>` (the default) for the
 * bare `{ ok: true }` success case.
 */

/** Field-level validation errors, keyed by form field name. */
export type FieldErrors = Record<string, string[]>;

/** The failure branch — identical across every action module. */
export type ActionFailure = {
  ok: false;
  error: string;
  fieldErrors?: FieldErrors;
};

/**
 * The success branch. `T` is spread onto `{ ok: true }`; a `void` payload
 * collapses to a bare `{ ok: true }`. The tuple wrapper (`[T] extends [void]`)
 * stops the conditional from distributing over a union `T`.
 */
export type ActionSuccess<T = void> = [T] extends [void]
  ? { ok: true }
  : { ok: true } & T;

/** Discriminated union returned by every server action. */
export type ActionResult<T = void> = ActionSuccess<T> | ActionFailure;

/** Build a success result, optionally carrying a typed payload. */
export function ok(): ActionResult<void>;
export function ok<T extends object>(data: T): ActionResult<T>;
export function ok<T extends object>(
  data?: T,
): ActionResult<T> | ActionResult<void> {
  return (data === undefined ? { ok: true } : { ok: true, ...data }) as
    | ActionResult<T>
    | ActionResult<void>;
}

/** Build a failure result with a user-facing message and optional field errors. */
export function fail(error: string, fieldErrors?: FieldErrors): ActionFailure {
  return fieldErrors ? { ok: false, error, fieldErrors } : { ok: false, error };
}

/**
 * Convert a Zod validation error into the standard failure result, replacing the
 * repeated `parsed.error.flatten().fieldErrors` inline blocks. The default
 * message matches the copy the editors already show.
 */
export function fromZodError(
  error: ZodError,
  message = "Please fix the highlighted fields.",
): ActionFailure {
  // Zod's flattened `fieldErrors` types its values as `string[] | undefined`
  // (a key may be absent). Copy only the populated entries so the result is a
  // clean `Record<string, string[]>` the clients' error state can consume.
  const flattened = error.flatten().fieldErrors;
  const fieldErrors: FieldErrors = {};
  for (const [key, value] of Object.entries(flattened)) {
    if (value && value.length > 0) fieldErrors[key] = value;
  }
  return { ok: false, error: message, fieldErrors };
}
