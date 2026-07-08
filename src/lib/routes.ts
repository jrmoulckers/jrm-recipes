import type { Route } from "next";

/**
 * Build an href for the *current* pathname with an optional query string.
 *
 * Filter and search controls navigate relative to wherever they're mounted via
 * `usePathname()`, a runtime `string` that Next can't prove is a typed `Route`.
 * The App Router's `router.push`/`replace` only accept a string href (not a
 * `UrlObject`), so this helper is the single sanctioned spot that produces the
 * typed `Route`, keeping the assertion out of every call site.
 *
 * `usePathname()` always returns a rooted path, so the leading slash is rebuilt
 * inline as a template literal (`/${rest}`) rather than asserting the bare
 * `string`. That keeps each cast a genuine widening whether the generated route
 * types are present or `next lint` sees the pre-build `string` fallback. An
 * empty or omitted query yields just the pathname.
 */
export function pathnameWithQuery(pathname: string, query?: string): Route {
  const rest = pathname.slice(1);
  if (query) return `/${rest}?${query}` as Route;
  return `/${rest}` as Route;
}