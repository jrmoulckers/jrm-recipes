import "server-only";

/**
 * Server-side consent gate (issue #324, hardened per the #471 review).
 *
 * The runtime consent singleton in `./consent` only exists in the browser, so
 * server-emitted events (capture / identify / alias) must re-derive the same
 * decision from the *request itself*: the consent cookie plus the `Sec-GPC` and
 * `DNT` privacy headers. This mirrors {@link isCaptureAllowed} so "no capture
 * before consent" and "always honor DNT/GPC" hold on the server too — not just
 * on the client path.
 *
 * Fails closed: if the request state can't be read (e.g. called outside a
 * request scope), nothing is captured.
 */
import { cookies, headers } from "next/headers";

import { ANALYTICS_CONSENT_COOKIE, parseConsent } from "~/config/consent";
import { analyticsRequiresConsent } from "./config";

/**
 * Whether server-side capture is permitted for the current request. Same rules,
 * in the same order, as the client {@link isCaptureAllowed}:
 *   1. A browser privacy signal (GPC/DNT) always blocks — regardless of config.
 *   2. An explicit "denied" cookie always blocks.
 *   3. In opt-in mode (`NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT=1`) only an
 *      explicit "granted" allows; missing/"unset" blocks.
 *   4. Otherwise (opt-out model) capture is allowed.
 */
export async function serverCaptureAllowed(): Promise<boolean> {
  try {
    const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);

    // 1. Browser privacy signals always win.
    if (headerStore.get("sec-gpc") === "1" || headerStore.get("dnt") === "1") {
      return false;
    }

    const status = parseConsent(
      cookieStore.get(ANALYTICS_CONSENT_COOKIE)?.value,
    );

    // 2. Explicit opt-out.
    if (status === "denied") return false;

    // 3. Opt-in model: nothing until an explicit grant.
    if (analyticsRequiresConsent()) return status === "granted";

    // 4. Opt-out model: allowed unless blocked above.
    return true;
  } catch {
    return false;
  }
}
