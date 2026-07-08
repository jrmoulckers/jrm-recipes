/**
 * Cross-origin hosts worth a `preconnect` (with a `dns-prefetch` fallback) from
 * the document `<head>` so the browser pays DNS + TCP + TLS setup ahead of the
 * request instead of inline with it (issue #214).
 */
export const RESOURCE_HINT_ORIGINS = {
  /** Serves the LCP recipe imagery (covers/hero/step) on image-bearing routes. */
  cloudinary: "https://res.cloudinary.com",
  /** Serves member/group avatars — only when auth is configured. */
  clerk: "https://img.clerk.com",
} as const;

/**
 * Origins to preconnect from the root layout. `res.cloudinary.com` is always
 * included because it fronts the LCP image on recipe routes; `img.clerk.com` is
 * only added when auth is configured, so we never preconnect to an origin the
 * page can't actually use.
 */
export function preconnectOrigins(authConfigured: boolean): string[] {
  const origins: string[] = [RESOURCE_HINT_ORIGINS.cloudinary];
  if (authConfigured) origins.push(RESOURCE_HINT_ORIGINS.clerk);
  return origins;
}
