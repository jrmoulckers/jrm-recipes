// @ts-check

/**
 * Allowlisted delivery hosts for *stored* recipe media (issue #216).
 *
 * Cover images, step images, and step videos are user-controlled and later
 * rendered on every recipe view, so an arbitrary `https://…` host would let a
 * recipe beacon viewers' IPs to attacker-controlled servers (tracking / CSRF).
 * This is the single source of truth shared by:
 *   - `next/image` `remotePatterns` (what the optimizer will fetch), and
 *   - the Zod media-URL validation in `src/server/recipes/validation.ts` (what
 *     we allow to be stored),
 * so what we render and what we persist can never drift apart.
 *
 * Kept in `.js` (not `.ts`) so `next.config.js` — plain Node ESM that cannot
 * import TypeScript — can consume it alongside the app code.
 */
export const ALLOWED_MEDIA_HOSTS = ["res.cloudinary.com", "img.clerk.com"];

/**
 * Whether `url` is a stored-media URL on an allowlisted host. Returns `false`
 * for a malformed URL, a non-http(s) scheme, or an off-allowlist host.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isAllowedMediaUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  return ALLOWED_MEDIA_HOSTS.includes(parsed.hostname.toLowerCase());
}
