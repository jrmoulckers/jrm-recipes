/**
 * Pathname normalization for pageview tracking (issue #322).
 *
 * App Router paths embed dynamic segments (`/recipes/<cuid>`, `/groups/<slug>`).
 * Sending them raw would explode path cardinality and turn analytics URLs into a
 * de-facto index of a family's private recipes/groups. We collapse each dynamic
 * segment to a stable placeholder (`/recipes/:id`) so funnels and path analysis
 * group correctly and no identifying slug leaks as a URL.
 */

/** Collection segments whose following segment is a dynamic id/slug. */
const DYNAMIC_SEGMENTS: Record<
  string,
  { placeholder: string; statics: ReadonlySet<string> }
> = {
  recipes: { placeholder: ":id", statics: new Set(["new"]) },
  collections: { placeholder: ":id", statics: new Set() },
  groups: { placeholder: ":slug", statics: new Set() },
};

/**
 * Collapse dynamic route params to placeholders, preserving static children
 * (e.g. `/recipes/new`, `/recipes/:id/edit`, `/groups/:slug/settings`).
 */
export function normalizePathname(pathname: string): string {
  if (!pathname) return "/";
  const segments = pathname.split("/");
  for (let i = 0; i < segments.length - 1; i++) {
    const rule = DYNAMIC_SEGMENTS[segments[i] ?? ""];
    const next = segments[i + 1];
    if (rule && next && !rule.statics.has(next)) {
      segments[i + 1] = rule.placeholder;
    }
  }
  const normalized = segments.join("/");
  return normalized.length > 0 ? normalized : "/";
}
