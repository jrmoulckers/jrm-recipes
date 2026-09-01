import { RESERVED_RECIPE_SLUGS } from './recipe-reserved-slugs';

/**
 * Maximum length of a user slug. Matches the `users.slug` column width, which
 * in turn matches `users.handle` so a handle can always be adopted as a slug.
 */
export const USER_SLUG_MAX_LENGTH = 60;

/**
 * Slugs no user may hold, because a user slug is the FIRST path segment under
 * `/recipes/*` once recipe URLs are namespaced (`/recipes/<userSlug>/<slug>`).
 *
 * Next.js resolves a static segment ahead of a dynamic one, so a user whose
 * slug is `new`, `tags`, or `cook-with` would have every one of their recipes
 * shadowed by the form/list page at `/recipes/<userSlug>/...`. The set is
 * inherited from {@link RESERVED_RECIPE_SLUGS} rather than duplicated so the
 * two can never drift apart when a new static sibling route is added.
 *
 * `r` is reserved on top of that: `/r/<shareToken>` is the unlisted-recipe
 * entry point, and a cook whose profile links read `/r/...` would be confusing
 * at best. `unclaimed` is the ownerless-recipe namespace. `admin`, `api`, and
 * `www` are reserved as conventional footguns.
 *
 * Deliberately dependency-free (no `next`, no DOM types) so it can be imported
 * from server mutations, route handlers, and the service-worker bundle alike.
 */
export const RESERVED_USER_SLUGS: ReadonlySet<string> = new Set([
  ...RESERVED_RECIPE_SLUGS,
  'r',
  'unclaimed',
  'api',
  'admin',
  'www',
]);

/** Whether `slug` is one no user may hold. */
export function isReservedUserSlug(slug: string): boolean {
  return RESERVED_USER_SLUGS.has(slug);
}

/**
 * The shape a user slug must take to be a safe, unambiguous URL segment:
 * lowercase alphanumerics separated by single hyphens, no leading/trailing
 * hyphen. Deliberately narrower than `slugify` output could be, so a slug can
 * never be mistaken for a cuid2 recipe id, contain a path separator, or need
 * percent-encoding.
 */
export const USER_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Whether `slug` is structurally valid *and* not reserved. This is the gate for
 * a user-chosen slug; {@link userSlugBase} is the gate for a derived one.
 */
export function isValidUserSlug(slug: string): boolean {
  return (
    slug.length > 0 &&
    slug.length <= USER_SLUG_MAX_LENGTH &&
    USER_SLUG_PATTERN.test(slug) &&
    !isReservedUserSlug(slug)
  );
}

/**
 * Normalize an arbitrary string into a candidate user slug, or `null` when
 * nothing usable survives (e.g. a name written entirely in a non-Latin script).
 * Callers fall back to an opaque slug in that case, so this never invents one.
 *
 * Not authoritative for uniqueness: the caller must still resolve collisions
 * against live slugs and the alias history.
 */
export function userSlugBase(input: string): string | null {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, USER_SLUG_MAX_LENGTH)
    // A trailing hyphen can reappear after the length cap.
    .replace(/-+$/g, '');
  return base.length > 0 ? base : null;
}

/**
 * An opaque, non-identifying slug for a user with no usable name or handle, and
 * for anonymizing a deleted account. `random` is supplied by the caller so this
 * stays pure and testable.
 */
export function opaqueUserSlug(random: string): string {
  return `cook-${random}`;
}
