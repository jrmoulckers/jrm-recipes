import "server-only";

/**
 * Server-side analytics entry (issue #305) for server actions and RSC.
 *
 * The browser client (`./index`) can't run here, so we emit directly to the
 * PostHog capture API over `fetch` — no vendor SDK, no shared singleton. Every
 * function is a safe no-op when analytics is unconfigured and swallows its own
 * errors, so instrumentation never blocks or breaks a server action. Callers
 * pass an explicit, non-PII distinct id (the internal user id — see #321).
 */
import {
  analyticsHost,
  analyticsKey,
  isAnalyticsConfigured,
} from "./config";
import { type AnalyticsEventName, type EventProperties } from "./events";
import { scrubProperties } from "./scrub";
import { serverCaptureAllowed } from "./server-consent";

/**
 * Hard ceiling on how long a call may wait on the analytics provider. Every
 * server post — capture *and* feature-flag `/decide` — aborts after this, so a
 * slow or hung backend can never delay SSR or a server action. On abort the
 * fetch rejects, is swallowed below, and callers fall back to control/no-op.
 */
const REQUEST_TIMEOUT_MS = 1500;

async function post(path: string, body: Record<string, unknown>): Promise<Response | null> {
  const key = analyticsKey();
  if (!key) return null;
  try {
    return await fetch(`${analyticsHost()}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ api_key: key, ...body }),
      cache: "no-store",
      keepalive: true,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

/**
 * Emit a taxonomy-valid event server-side against a caller-supplied distinct id.
 * Returns a promise, but call sites in server actions should fire-and-forget
 * (`void captureServer(...)`) so tracking never adds latency to the response.
 */
export async function captureServer<K extends AnalyticsEventName>(
  distinctId: string,
  name: K,
  properties: EventProperties[K],
): Promise<void> {
  if (!isAnalyticsConfigured()) return;
  if (!(await serverCaptureAllowed())) return;
  await post("/capture/", {
    event: name,
    distinct_id: distinctId,
    properties: scrubProperties(properties) ?? {},
    timestamp: new Date().toISOString(),
  });
}

/** Attach non-PII person properties to an identified user (see #321). */
export async function identifyServer(
  distinctId: string,
  setProperties?: Record<string, unknown>,
): Promise<void> {
  if (!isAnalyticsConfigured()) return;
  if (!(await serverCaptureAllowed())) return;
  await post("/capture/", {
    event: "$identify",
    distinct_id: distinctId,
    properties: { $set: scrubProperties(setProperties) ?? {} },
    timestamp: new Date().toISOString(),
  });
}

/** Stitch an anonymous device id to the identified user id (funnel stitching). */
export async function aliasServer(distinctId: string, aliasId: string): Promise<void> {
  if (!isAnalyticsConfigured()) return;
  if (!(await serverCaptureAllowed())) return;
  await post("/capture/", {
    event: "$create_alias",
    distinct_id: distinctId,
    properties: { distinct_id: distinctId, alias: aliasId },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Evaluate all feature flags for a distinct id (issue #335). Returns an empty
 * map when analytics is unconfigured, when the request fails, or when it exceeds
 * {@link REQUEST_TIMEOUT_MS} (a slow provider must never stall SSR) — so callers
 * always fall back to control and never block render.
 *
 * Note: flag evaluation is *read-only* (no event, no PII leaves the app), so it
 * is intentionally not consent-gated; only capture/identify/alias are.
 */
export async function getAllFlags(
  distinctId: string,
): Promise<Record<string, string | boolean>> {
  if (!isAnalyticsConfigured()) return {};
  const res = await post("/decide/?v=3", { distinct_id: distinctId });
  if (!res?.ok) return {};
  try {
    const data = (await res.json()) as {
      featureFlags?: Record<string, string | boolean>;
    };
    return data.featureFlags ?? {};
  } catch {
    return {};
  }
}

/**
 * Evaluate a single flag, falling back to `fallback` (default `false`, i.e.
 * control) when unset, unconfigured, or on error.
 */
export async function getFlag(
  distinctId: string,
  key: string,
  fallback: string | boolean = false,
): Promise<string | boolean> {
  const flags = await getAllFlags(distinctId);
  return key in flags ? flags[key]! : fallback;
}
