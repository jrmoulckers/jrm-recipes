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

/** Cloudinary host that fronts recipe media (covers/steps/video, avatars). */
const CLOUDINARY = "https://res.cloudinary.com";
/** Clerk-served avatar host (only reachable when auth is configured). */
const CLERK_IMG = "https://img.clerk.com";
/** Clerk Frontend API + hosted UI origins (dev + prod instances). */
const CLERK_ORIGINS = ["https://*.clerk.accounts.dev", "https://clerk.dev"];
/** Cloudflare Turnstile — Clerk's bot-protection challenge widget. */
const TURNSTILE = "https://challenges.cloudflare.com";
/** PostHog product-analytics hosts (capture is same-origin via /ingest). */
const POSTHOG = ["https://*.posthog.com", "https://*.i.posthog.com"];

/**
 * Build the Content-Security-Policy header value for a request, binding all
 * first-party inline/bootstrap scripts to `nonce`.
 */
export function buildContentSecurityPolicy(nonce: string): string {
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
      // Ignored where strict-dynamic is honored; fallback for old browsers.
      "https:",
      "'unsafe-inline'",
    ],
    // Tailwind + Next inject inline <style>; hashing them per-build is brittle.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", CLOUDINARY, CLERK_IMG],
    "font-src": ["'self'", "data:"],
    "media-src": ["'self'", "blob:", CLOUDINARY],
    "connect-src": ["'self'", CLOUDINARY, ...CLERK_ORIGINS, ...POSTHOG],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "frame-src": ["'self'", ...CLERK_ORIGINS, TURNSTILE],
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
