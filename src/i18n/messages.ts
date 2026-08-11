/**
 * Route-scoped message selection (#674).
 *
 * `NextIntlClientProvider` takes `messages` as a *prop*, so whatever it is given
 * is serialized into the RSC flight payload and sent over the wire. Handing it
 * `getMessages()` sends the entire ~130 kB catalog on every document, including
 * the namespaces for features the route never renders.
 *
 * These helpers narrow that payload to the namespaces a route's client
 * components can actually reach, using the generated manifest in
 * `./route-namespaces`. Kept framework-free (no `next/*` imports) so it is
 * directly unit-testable.
 */
import { ROUTE_NAMESPACES, SHELL_NAMESPACES } from "./route-namespaces";

type Messages = Record<string, unknown>;

/** Split a URL pathname into its segments, tolerating trailing slashes. */
function segmentsOf(pathname: string): string[] {
  return pathname.split("/").filter((segment) => segment.length > 0);
}

const ROUTE_PATTERNS = Object.keys(ROUTE_NAMESPACES).map((pattern) => ({
  pattern,
  segments: segmentsOf(pattern),
}));

/**
 * Find the manifest pattern that serves `pathname`.
 *
 * Segment counts must match exactly (there are no catch-all routes), and a
 * literal segment beats a dynamic one at the same position — the same
 * precedence the App Router itself uses, so `/recipes/new` resolves to the
 * static route rather than `/recipes/:`.
 */
export function matchRoutePattern(pathname: string): string | null {
  const segments = segmentsOf(pathname);
  let best: { pattern: string; score: number } | null = null;

  for (const candidate of ROUTE_PATTERNS) {
    if (candidate.segments.length !== segments.length) continue;

    let score = 0;
    let matched = true;
    for (const [index, expected] of candidate.segments.entries()) {
      if (expected === ":") continue;
      if (expected !== segments[index]) {
        matched = false;
        break;
      }
      // Earlier literal segments are more specific than later ones.
      score += candidate.segments.length - index;
    }

    if (!matched) continue;
    if (!best || score > best.score)
      best = { pattern: candidate.pattern, score };
  }

  return best?.pattern ?? null;
}

/**
 * The namespaces a request's client tree needs: the persistent shell plus the
 * matched route's own set.
 *
 * Returns `null` when the pathname cannot be matched — a route added without
 * regenerating the manifest, or a request that somehow arrived without the
 * pathname header. Callers treat `null` as "ship everything", so an unknown
 * route degrades to today's behaviour (bigger payload) rather than to missing
 * copy.
 */
export function namespacesForPathname(
  pathname: string | null | undefined,
): string[] | null {
  if (!pathname) return null;
  const pattern = matchRoutePattern(pathname);
  if (pattern === null) return null;
  return [...new Set([...SHELL_NAMESPACES, ...ROUTE_NAMESPACES[pattern]!])];
}

/**
 * Narrow a catalog to `namespaces`. A `null` selection returns the catalog
 * untouched. Unknown namespaces are skipped rather than serialized as
 * `undefined`, which would confuse next-intl's message lookup.
 */
export function pickMessages<T extends Messages>(
  messages: T,
  namespaces: readonly string[] | null,
): Messages {
  if (namespaces === null) return messages;

  const picked: Messages = {};
  for (const namespace of namespaces) {
    if (namespace in messages) picked[namespace] = messages[namespace];
  }
  return picked;
}
