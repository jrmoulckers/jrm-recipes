/**
 * HTTP security headers + Content-Security-Policy (issue #212).
 *
 * Kept free of `server-only` and any Node built-ins so it can run in the Edge
 * middleware runtime and be unit-tested in isolation. The policy is
 * **nonce + `strict-dynamic`** based: the middleware mints a fresh nonce per
 * request, forwards it to the app (so Next.js nonces its own bootstrap scripts
 * and our inline theme/a11y no-flash scripts pick it up), and every other script
 * origin is trusted transitively via `strict-dynamic`. The legacy `https:` /
 * `'unsafe-inline'` tokens are ignored by browsers that honor `strict-dynamic`
 * and only serve as a graceful fallback for older engines.
 */

/** Cloudinary hosts: media delivery, the upload widget iframe, and its API. */
const CLOUDINARY_DELIVERY = "https://res.cloudinary.com";
const CLOUDINARY_UPLOAD_WIDGET = "https://upload-widget.cloudinary.com";
const CLOUDINARY_API = "https://api.cloudinary.com";
/** Clerk-served avatar host (only reachable when auth is configured). */
const CLERK_IMG = "https://img.clerk.com";
/**
 * Clerk *development* Frontend API origins (pk_test instances serve FAPI from a
 * shared `*.clerk.accounts.dev` host). Production (pk_live) uses a per-app custom
 * domain that we derive at runtime from the publishable key — see
 * {@link clerkFrontendApiHost} — so nothing is blocked on the real domain.
 */
const CLERK_DEV_ORIGINS = ["https://*.clerk.accounts.dev"];
/** Cloudflare Turnstile — Clerk's bot-protection challenge widget. */
const TURNSTILE = "https://challenges.cloudflare.com";
/** PostHog product-analytics hosts (capture is same-origin via /ingest). */
const POSTHOG = ["https://*.posthog.com", "https://*.i.posthog.com"];

/**
 * Derive a Clerk instance's Frontend API host from its publishable key
 * (issue #212). Clerk encodes the host in the key: `pk_live_<base64>` /
 * `pk_test_<base64>`, where the base64 segment decodes to `<host>$`. A pk_live
 * instance serves FAPI from a per-app custom domain (e.g. `clerk.example.com`)
 * that clerk-js reaches via fetch/XHR + a session iframe — none of which are
 * covered by `strict-dynamic` — so the derived host must be allowlisted or
 * sign-in, session hydration, and every authed action break in production.
 *
 * Returns `null` for an absent/malformed key (dev-bypass / e2e with no key), so
 * the policy simply omits the origin rather than emitting a broken token.
 */
export function clerkFrontendApiHost(
  publishableKey: string | undefined,
): string | null {
  if (!publishableKey) return null;
  const encoded = publishableKey.replace(/^pk_(test|live)_/, "");
  if (encoded === publishableKey) return null;
  try {
    const host = atob(encoded).replace(/\$+$/, "");
    // Guard against a malformed decode injecting extra CSP tokens/directives.
    return /^[a-z0-9.-]+$/i.test(host) ? host : null;
  } catch {
    return null;
  }
}

/**
 * Build the Content-Security-Policy header value for a request, binding all
 * first-party inline/bootstrap scripts to `nonce`. When a Clerk publishable key
 * is provided, its Frontend API host is allowlisted across the
 * script/connect/img/frame directives so a real production (pk_live) deploy
 * works; dev (pk_test) additionally keeps the shared `*.clerk.accounts.dev`
 * origins.
 */
export function buildContentSecurityPolicy(
  nonce: string,
  publishableKey?: string,
): string {
  const clerkHost = clerkFrontendApiHost(publishableKey);
  const clerkConnectFrame = [
    ...CLERK_DEV_ORIGINS,
    ...(clerkHost ? [`https://${clerkHost}`] : []),
  ];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    // Belt-and-suspenders clickjacking defense alongside X-Frame-Options.
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      // Cloudinary upload widget + Clerk prod FAPI load scripts that
      // strict-dynamic covers transitively, but list the widget host explicitly
      // for engines that gate the initial <script src> on the origin.
      CLOUDINARY_UPLOAD_WIDGET,
      ...(clerkHost ? [`https://${clerkHost}`] : []),
      // Ignored where strict-dynamic is honored; fallback for old browsers.
      "https:",
      "'unsafe-inline'",
    ],
    // Tailwind + Next inject inline <style>; hashing them per-build is brittle.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      CLOUDINARY_DELIVERY,
      CLERK_IMG,
      ...(clerkHost ? [`https://${clerkHost}`] : []),
    ],
    "font-src": ["'self'", "data:"],
    "media-src": ["'self'", "blob:", CLOUDINARY_DELIVERY],
    "connect-src": [
      "'self'",
      CLOUDINARY_DELIVERY,
      CLOUDINARY_API,
      CLOUDINARY_UPLOAD_WIDGET,
      ...clerkConnectFrame,
      ...POSTHOG,
    ],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "frame-src": [
      "'self'",
      CLOUDINARY_UPLOAD_WIDGET,
      ...clerkConnectFrame,
      TURNSTILE,
    ],
    // Auto-upgrade any stray http subresource to https in production.
    "upgrade-insecure-requests": [],
  };

  return Object.entries(directives)
    .map(([name, values]) =>
      values.length > 0 ? `${name} ${values.join(" ")}` : name,
    )
    .join("; ");
}

/**
 * The static (non-CSP) security headers applied to every response. Values are
 * intentionally conservative: deny framing, no MIME sniffing, minimal referrer
 * leakage of share URLs, HSTS with preload, and a locked-down Permissions-Policy
 * that switches off device APIs the app never uses.
 */
export function staticSecurityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), browsing-topics=()",
    "X-DNS-Prefetch-Control": "on",
  };
}

/**
 * Apply the CSP + static security headers to a response's Headers. Mutates and
 * returns the same Headers object for convenience.
 */
export function applySecurityHeaders(headers: Headers, csp: string): Headers {
  headers.set("Content-Security-Policy", csp);
  for (const [name, value] of Object.entries(staticSecurityHeaders())) {
    headers.set(name, value);
  }
  return headers;
}

/** Mint a fresh, base64 CSP nonce using the Web Crypto API (Edge-safe). */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
