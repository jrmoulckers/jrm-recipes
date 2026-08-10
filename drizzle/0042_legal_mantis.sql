-- Issue #666: recipe slugs become unique per author, plus their permanent alias
-- history (rename retention + legacy flat-URL retention).
--
-- Hand-adjusted from the generated migration for idempotence (CI applies the
-- migrations against a fresh Postgres and asserts a re-run is a no-op) and to
-- seed `recipe_slug_aliases` from the pre-namespacing global slugs. The end
-- state is identical to the generated snapshot, so `pnpm db:generate` stays
-- clean.

CREATE TABLE IF NOT EXISTS "recipe_slug_aliases" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"owner_id" varchar(24) NOT NULL,
	"slug" varchar(96) NOT NULL,
	"recipe_id" varchar(24) NOT NULL,
	"legacy" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_slug_aliases_owner_slug_uq" UNIQUE("owner_id","slug")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "recipe_slug_aliases" ADD CONSTRAINT "recipe_slug_aliases_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "recipe_slug_aliases" ADD CONSTRAINT "recipe_slug_aliases_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recipe_slug_aliases_legacy_slug_uq" ON "recipe_slug_aliases" USING btree ("slug") WHERE "recipe_slug_aliases"."legacy";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipe_slug_aliases_recipe_idx" ON "recipe_slug_aliases" USING btree ("recipe_id");
--> statement-breakpoint
-- Seed one `legacy` alias per existing recipe from its current slug. These rows
-- are what keeps a pre-namespacing `/recipes/<slug>` link resolving once the
-- canonical URL becomes `/recipes/<cook>/<slug>`. The source column was globally
-- unique, so the partial unique index over `legacy` rows cannot fail here and
-- the flat lookup stays unambiguous forever.
--
-- The id is derived from the recipe id (not random) so re-running the migration
-- collides with the row it already wrote instead of inserting a duplicate.
-- Soft-deleted recipes are included: a tombstone can be restored, and its links
-- should survive the round trip.
INSERT INTO "recipe_slug_aliases" ("id", "owner_id", "slug", "recipe_id", "legacy")
SELECT
	left(md5('recipe-slug-alias:' || "id"), 24),
	"author_id",
	"slug",
	"id",
	true
FROM "recipes"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "recipes" DROP CONSTRAINT IF EXISTS "recipes_slug_uq";
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "recipes" ADD CONSTRAINT "recipes_author_slug_uq" UNIQUE("author_id","slug");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
