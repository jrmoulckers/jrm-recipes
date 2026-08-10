/**
 * PII-scrubbing guard (issue #305).
 *
 * The taxonomy in `./events` is already designed to be PII-free, but this is the
 * defense-in-depth net applied to every property bag *this module dispatches*,
 * so a careless call site can never leak private family data into the analytics
 * tool. It drops keys whose names look identifying and redacts values that look
 * like emails or phone numbers.
 *
 * Coverage is by convention, not by construction: it holds because `track()`
 * (`./index`) and `captureServer()` (`./server`) are the only capture paths, and
 * both call this. Events the vendor SDK generates internally never traverse
 * either, so they are *not* scrubbed — which is why autocapture is explicitly
 * disabled in `./posthog-client` (#703). Anything that re-enables an SDK-internal
 * capture path is outside this net and has to be assessed on its own.
 */

/** Substrings that mark a property key as identifying (matched case-insensitively). */
const PII_KEY_PATTERNS = [
  'email',
  'e-mail',
  'firstname',
  'lastname',
  'fullname',
  'username',
  'handle',
  'phone',
  'address',
  'password',
  'secret',
  'token',
  'apikey',
  'ssn',
  'dob',
  'birthday',
  'birthdate',
] as const;

/** Keys that are explicitly allowed even though they contain a flagged substring. */
const ALLOWLIST = new Set<string>([
  // PostHog's own reserved property, not user PII.
  '$feature_flag_response',
]);

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_RE = /(?:\+?\d[\s.-]?){7,}/;

const REDACTED = '[redacted]';

function isPiiKey(key: string): boolean {
  if (ALLOWLIST.has(key)) return false;
  const lower = key.toLowerCase();
  return PII_KEY_PATTERNS.some((pattern) => lower.includes(pattern));
}

function scrubValue(value: unknown): unknown {
  if (typeof value === 'string') {
    if (EMAIL_RE.test(value) || PHONE_RE.test(value)) return REDACTED;
    return value;
  }
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === 'object') {
    return scrubProperties(value as Record<string, unknown>);
  }
  return value;
}

/**
 * Return a copy of `properties` with identifying keys removed and email/phone
 * values redacted. Pure and total. Safe to call on any input, including nested
 * objects. Returns `undefined` when there's nothing to send.
 */
export function scrubProperties(
  properties?: Record<string, unknown> | null,
): Record<string, unknown> | undefined {
  if (!properties) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (isPiiKey(key)) continue;
    out[key] = scrubValue(value);
  }
  return out;
}
