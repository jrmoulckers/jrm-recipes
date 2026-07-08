/**
 * One-off backfill: fold duplicate / alias tags onto their canonical tag.
 *
 * `syncTags` now canonicalizes on write (see `src/lib/tag-taxonomy.ts`), but
 * tags created before that still fragment discovery ("veggie" vs "Vegetarian",
 * "gf" vs "Gluten-Free"). This script groups every existing tag by the slug it
 * canonicalizes to, keeps one row per group (renaming it to the canonical
 * slug + name), re-points `recipe_tags` at the keeper, and deletes the orphans.
 *
 * Idempotent: running it again is a no-op once tags are canonical. Free-form
 * (unknown) tags are left untouched. Run with `pnpm db:backfill-tags`.
 *
 * Connection: prefers a direct (non-pooled) URL for the DML, mirroring
 * `scripts/migrate.mjs`.
 */
import postgres from "postgres";

import { canonicalizeTag } from "../src/lib/tag-taxonomy";

const url =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL;

if (!url) {
  console.log("[backfill-tags] No database URL set — nothing to do.");
  process.exit(0);
}

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

type TagRow = { id: string; slug: string; name: string };

async function main() {
  const tags = await sql<TagRow[]>`SELECT id, slug, name FROM tags`;

  // Group existing tags by the slug they canonicalize to.
  const groups = new Map<
    string,
    { canonical: { slug: string; name: string }; members: TagRow[] }
  >();
  for (const tag of tags) {
    const canonical = canonicalizeTag(tag.name);
    const group = groups.get(canonical.slug) ?? { canonical, members: [] };
    group.members.push(tag);
    groups.set(canonical.slug, group);
  }

  let renamed = 0;
  let merged = 0;

  for (const [canonicalSlug, { canonical, members }] of groups) {
    // Keeper: a member already at the canonical slug, else the first one.
    const keeper =
      members.find((m) => m.slug === canonicalSlug) ?? members[0]!;

    // Ensure the keeper carries the canonical slug + display name.
    if (keeper.slug !== canonical.slug || keeper.name !== canonical.name) {
      await sql`
        UPDATE tags SET slug = ${canonical.slug}, name = ${canonical.name}
        WHERE id = ${keeper.id}
      `;
      renamed++;
    }

    for (const loser of members.filter((m) => m.id !== keeper.id)) {
      // Re-point recipe_tags to the keeper, skipping pairs that already exist.
      await sql`
        INSERT INTO recipe_tags (recipe_id, tag_id)
        SELECT recipe_id, ${keeper.id} FROM recipe_tags WHERE tag_id = ${loser.id}
        ON CONFLICT DO NOTHING
      `;
      await sql`DELETE FROM recipe_tags WHERE tag_id = ${loser.id}`;
      await sql`DELETE FROM tags WHERE id = ${loser.id}`;
      merged++;
    }
  }

  console.log(
    `[backfill-tags] Renamed ${renamed} tag(s) to canonical form; merged ${merged} duplicate(s).`,
  );
}

main()
  .then(() => sql.end())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error("[backfill-tags] Failed:", error);
    await sql.end({ timeout: 5 }).catch(() => {});
    process.exit(1);
  });
