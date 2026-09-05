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
const DYNAMIC_SEGMENTS: Record<string, { placeholder: string; statics: ReadonlySet<string> }> = {
  collections: { placeholder: ':id', statics: new Set() },
  cooks: { placeholder: ':handle', statics: new Set() },
  groups: { placeholder: ':slug', statics: new Set() },
  join: { placeholder: ':token', statics: new Set() },
  r: { placeholder: ':token', statics: new Set() },
};

const RECIPE_STATIC_SEGMENTS = new Set(['cook-with', 'new', 'tags']);
const RECIPE_ACTION_SEGMENTS = new Set(['cook', 'edit', 'keepsake', 'print']);

/**
 * Collapse dynamic route params to placeholders, preserving static children
 * (e.g. `/recipes/new`, `/recipes/:id/edit`, `/groups/:slug/settings`).
 */
export function normalizePathname(pathname: string): string {
  if (!pathname) return '/';
  const segments = pathname.split('/');

  const recipesIndex = segments.indexOf('recipes');
  if (recipesIndex >= 0) {
    const first = segments[recipesIndex + 1];
    const second = segments[recipesIndex + 2];
    if (first && !RECIPE_STATIC_SEGMENTS.has(first)) {
      segments[recipesIndex + 1] = first === 'unclaimed' ? 'unclaimed' : ':cook';
      if (first === 'unclaimed' && second) {
        segments[recipesIndex + 2] = ':id';
      } else if (second && !RECIPE_ACTION_SEGMENTS.has(second)) {
        segments[recipesIndex + 2] = ':recipe';
      } else {
        segments[recipesIndex + 1] = ':id';
      }
    }
  }

  for (let i = 0; i < segments.length - 1; i++) {
    const rule = DYNAMIC_SEGMENTS[segments[i] ?? ''];
    const next = segments[i + 1];
    if (rule && next && !rule.statics.has(next)) {
      segments[i + 1] = rule.placeholder;
    }
  }
  const normalized = segments.join('/');
  return normalized.length > 0 ? normalized : '/';
}
