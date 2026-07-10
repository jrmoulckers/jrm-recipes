// @ts-check
/**
 * Structured server logger (#268).
 *
 * A tiny dependency-free logger for server actions, route handlers, and Node
 * scripts (`scripts/migrate.mjs`). It emits one JSON object per line with a
 * level, timestamp, message, and structured fields, so Vercel's log drain can
 * be searched and filtered instead of grepping free-text `console.*` output.
 *
 * Design goals:
 * - **Levels**: debug < info < warn < error < silent, gated by `LOG_LEVEL`.
 *   Defaults to `info` in production (quiet — no debug spam) and `debug`
 *   elsewhere, so local/dev/test stay chatty and prod stays lean.
 * - **Redaction**: secret- and PII-looking keys (token, password, DATABASE_URL,
 *   authorization, cookie, …) and secret-shaped values (Postgres URLs, bearer
 *   tokens, JWT/`sk_`/`whsec_` keys) are replaced with `[REDACTED]` so a stray
 *   `log.info({ env: process.env })` can never leak a credential.
 * - **Correlation**: `createLogger({ requestId })` / `log.child({ … })` bind
 *   fields (e.g. a request id) onto every subsequent line.
 * - **Zero config**: reads only `process.env` (never `~/env`), so importing it
 *   from a deploy-time script can't trigger env validation.
 *
 * Import from server-only code paths — it writes to `process.stdout` /
 * `process.stderr` and must never be pulled into a client bundle.
 */

/** @typedef {"debug" | "info" | "warn" | "error" | "silent"} LogLevel */

/** @type {Record<LogLevel, number>} */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

/**
 * Resolve the active threshold from `LOG_LEVEL`, defaulting to `info` in
 * production and `debug` otherwise. Unknown values fall back to the default.
 *
 * @returns {LogLevel}
 */
function resolveLevel() {
  const raw = (process.env.LOG_LEVEL ?? "").toLowerCase();
  if (raw in LEVELS) return /** @type {LogLevel} */ (raw);
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

/**
 * Key names whose *value* is always redacted regardless of shape. Matched
 * case-insensitively as a substring so `clerkSecretKey`, `DATABASE_URL`,
 * `x-api-key`, etc. are all caught.
 */
const SENSITIVE_KEY =
  /secret|token|password|passwd|pwd|authorization|api[-_]?key|cookie|session|credential|connection|database_url|dsn|clerk|stripe|webhook|signature|bearer/i;

/**
 * Value-shaped secrets to scrub even under an innocuous key (e.g. a Postgres
 * URL logged as `url`, or a token pasted into a free-text message).
 */
const SENSITIVE_VALUE = [
  /\b[a-z]+:\/\/[^\s:@/]+:[^\s:@/]+@[^\s]+/gi, // any `scheme://user:pass@host` URL
  /\b(?:sk|pk|rk|whsec|price)_[A-Za-z0-9_]{6,}/g, // Stripe / Clerk-style keys
  /\bBearer\s+[A-Za-z0-9._-]{8,}/gi, // Authorization: Bearer <token>
  /\beyJ[A-Za-z0-9._-]{10,}/g, // JWT-shaped tokens
];

const REDACTED = "[REDACTED]";

/**
 * Scrub secret-shaped substrings from a string value.
 *
 * @param {string} value
 * @returns {string}
 */
function scrubString(value) {
  let out = value;
  for (const re of SENSITIVE_VALUE) out = out.replace(re, REDACTED);
  return out;
}

/**
 * Recursively redact a value: sensitive keys are dropped wholesale, strings are
 * scrubbed for secret-shaped substrings, and structures are walked with a depth
 * cap and a seen-set so cycles and huge graphs can't hang or blow the stack.
 *
 * @param {unknown} value
 * @param {number} depth
 * @param {WeakSet<object>} seen
 * @returns {unknown}
 */
function redact(value, depth, seen) {
  if (value == null) return value;
  if (typeof value === "string") return scrubString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) {
    return { name: value.name, message: scrubString(value.message) };
  }
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "function") return "[Function]";
  if (typeof value !== "object") return "[Unserializable]";
  if (depth >= 6) return "[Truncated]";
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => redact(item, depth + 1, seen));
  }

  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, val] of Object.entries(/** @type {object} */ (value))) {
    out[key] = SENSITIVE_KEY.test(key)
      ? REDACTED
      : redact(val, depth + 1, seen);
  }
  return out;
}

/**
 * Redact an arbitrary bag of structured fields for emission.
 *
 * @param {Record<string, unknown>} fields
 * @returns {Record<string, unknown>}
 */
export function redactFields(fields) {
  return /** @type {Record<string, unknown>} */ (
    redact(fields, 0, new WeakSet())
  );
}

/**
 * @typedef {Object} Logger
 * @property {(msg: string, fields?: Record<string, unknown>) => void} debug
 * @property {(msg: string, fields?: Record<string, unknown>) => void} info
 * @property {(msg: string, fields?: Record<string, unknown>) => void} warn
 * @property {(msg: string, fields?: Record<string, unknown>) => void} error
 * @property {(fields: Record<string, unknown>) => Logger} child
 */

/**
 * Create a logger whose lines are pre-tagged with `base` fields (e.g. a
 * `requestId` or `scope`). `child` returns a further-bound logger.
 *
 * @param {Record<string, unknown>} [base]
 * @returns {Logger}
 */
export function createLogger(base = {}) {
  const boundBase = redactFields(base);

  /**
   * @param {LogLevel} level
   * @param {string} msg
   * @param {Record<string, unknown>} [fields]
   */
  function emit(level, msg, fields) {
    if (LEVELS[level] < LEVELS[resolveLevel()]) return;
    const entry = {
      level,
      time: new Date().toISOString(),
      msg: scrubString(msg),
      ...boundBase,
      ...(fields ? redactFields(fields) : undefined),
    };
    const line = JSON.stringify(entry) + "\n";
    if (level === "warn" || level === "error") process.stderr.write(line);
    else process.stdout.write(line);
  }

  return {
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
    child: (fields) => createLogger({ ...boundBase, ...fields }),
  };
}

/** Shared application logger. */
export const log = createLogger();
