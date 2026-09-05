/**
 * PII-scrubbing guard (issue #305).
 *
 * The taxonomy in `./events` is already designed to be PII-free, but this is the
 * defense-in-depth net applied before dispatch. The browser adapter also applies
 * `scrubPostHogCapture()` in PostHog's `before_send` hook, so SDK-internal events
 * cannot bypass the net. It drops keys whose names look identifying and redacts
 * values that look like emails or phone numbers.
 */

import { type CaptureResult } from 'posthog-js';

import { normalizePathname } from './pageview';

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
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:T[\d:.+-]+Z?)?$/;

const REDACTED = '[redacted]';
const RELATIVE_URL_BASE = 'https://relative.invalid';

const CURRENT_URL_PROPERTIES = new Set([
  '$current_url',
  '$initial_current_url',
  '$session_entry_url',
]);
const REFERRER_PROPERTIES = new Set([
  '$referrer',
  '$initial_referrer',
  '$session_entry_referrer',
  '$external_click_url',
]);
const PATHNAME_PROPERTIES = new Set([
  '$pathname',
  '$initial_pathname',
  '$prev_pageview_pathname',
  '$session_entry_pathname',
]);
const FREE_TEXT_PROPERTIES = new Set([
  'title',
  '$el_text',
  '$elements',
  '$elements_chain',
  '$exception_list',
  '$exception_message',
  '$exception_stack_trace_raw',
  '$selected_content',
  '$title',
]);
const QUERY_DERIVED_PROPERTIES = new Set([
  '_kx',
  'dclid',
  'epik',
  'fbclid',
  'gbraid',
  'gclid',
  'gclsrc',
  'gad_source',
  'igshid',
  'irclid',
  'li_fat_id',
  'mc_cid',
  'msclkid',
  'ph_keyword',
  'qclid',
  'rdt_cid',
  'sccid',
  'ttclid',
  'twclid',
  'utm_campaign',
  'utm_content',
  'utm_medium',
  'utm_source',
  'utm_term',
  'wbraid',
]);

function isPiiKey(key: string): boolean {
  if (ALLOWLIST.has(key)) return false;
  const lower = key.toLowerCase();
  return PII_KEY_PATTERNS.some((pattern) => lower.includes(pattern));
}

function scrubValue(value: unknown): unknown {
  if (typeof value === 'string') {
    if (EMAIL_RE.test(value) || (PHONE_RE.test(value) && !ISO_DATE_RE.test(value))) return REDACTED;
    return value;
  }
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === 'object') {
    return scrubProperties(value as Record<string, unknown>);
  }
  return value;
}

function isHttpUrl(url: URL): boolean {
  return url.protocol === 'http:' || url.protocol === 'https:';
}

function scrubCurrentUrl(value: unknown): unknown {
  if (typeof value !== 'string') return REDACTED;

  try {
    const isRelative = value.startsWith('/');
    const url = isRelative ? new URL(value, RELATIVE_URL_BASE) : new URL(value);
    if (!isHttpUrl(url)) return REDACTED;

    const pathname = normalizePathname(url.pathname);
    return isRelative ? pathname : `${url.origin}${pathname}`;
  } catch {
    return REDACTED;
  }
}

function scrubReferrer(value: unknown): unknown {
  if (value === '$direct') return value;
  if (typeof value !== 'string') return REDACTED;

  try {
    const url = new URL(value);
    return isHttpUrl(url) ? url.origin : REDACTED;
  } catch {
    return REDACTED;
  }
}

function scrubPathname(value: unknown): unknown {
  if (typeof value !== 'string' || !value.startsWith('/')) return REDACTED;

  try {
    return normalizePathname(new URL(value, RELATIVE_URL_BASE).pathname);
  } catch {
    return REDACTED;
  }
}

function scrubHeatmapData(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return REDACTED;

  const out: Record<string, unknown> = {};
  for (const [url, points] of Object.entries(value)) {
    const scrubbedUrl = scrubCurrentUrl(url);
    const key = typeof scrubbedUrl === 'string' ? scrubbedUrl : REDACTED;
    const scrubbedPoints = scrubValue(points);
    const existing = out[key];
    out[key] =
      Array.isArray(existing) && Array.isArray(scrubbedPoints)
        ? [...existing, ...scrubbedPoints]
        : scrubbedPoints;
  }
  return out;
}

function isFreeTextProperty(key: string): boolean {
  return (
    FREE_TEXT_PROPERTIES.has(key) ||
    key.startsWith('$el_attr__') ||
    key.startsWith('$survey_response')
  );
}

function isQueryDerivedProperty(key: string): boolean {
  const baseKey = key.replace(/^\$(?:initial|session_entry)_/, '');
  return QUERY_DERIVED_PROPERTIES.has(baseKey);
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

/**
 * Scrub a PostHog event property bag without removing reserved SDK machinery.
 * Reserved fields pass through by default; fields known to contain DOM text,
 * attributes, paths, or URLs receive stricter handling.
 */
export function scrubPostHogProperties(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (key === 'token') {
      out[key] = value;
    } else if (key === '$set' || key === '$set_once') {
      out[key] =
        value && typeof value === 'object' && !Array.isArray(value)
          ? scrubPostHogProperties(value as Record<string, unknown>)
          : {};
    } else if (CURRENT_URL_PROPERTIES.has(key)) {
      out[key] = scrubCurrentUrl(value);
    } else if (REFERRER_PROPERTIES.has(key)) {
      out[key] = scrubReferrer(value);
    } else if (PATHNAME_PROPERTIES.has(key)) {
      out[key] = scrubPathname(value);
    } else if (key === '$heatmap_data') {
      out[key] = scrubHeatmapData(value);
    } else if (/^\$web_vitals_.+_event$/.test(key)) {
      out[key] =
        value && typeof value === 'object' && !Array.isArray(value)
          ? scrubPostHogProperties(value as Record<string, unknown>)
          : REDACTED;
    } else if (isFreeTextProperty(key)) {
      out[key] = REDACTED;
    } else if (isQueryDerivedProperty(key)) {
      out[key] = value == null ? value : REDACTED;
    } else if (key.startsWith('$')) {
      out[key] = value;
    } else {
      const scrubbed = scrubProperties({ [key]: value });
      if (scrubbed && key in scrubbed) out[key] = scrubbed[key];
    }
  }

  return out;
}

/** Scrub every property bag on an outbound PostHog capture result. */
export function scrubPostHogCapture(capture: CaptureResult | null): CaptureResult | null {
  if (!capture) return null;

  return {
    ...capture,
    properties: scrubPostHogProperties(capture.properties),
    ...(capture.$set ? { $set: scrubPostHogProperties(capture.$set) } : {}),
    ...(capture.$set_once ? { $set_once: scrubPostHogProperties(capture.$set_once) } : {}),
  };
}
