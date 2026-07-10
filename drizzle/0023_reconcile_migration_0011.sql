-- Reconcile migration 0011 (#0011_colorful_thundra), which never executed on the
-- production database: its recorded __drizzle_migrations timestamp predates the
-- latest applied migration, so drizzle's timestamp-based migrator treats it as
-- applied and never runs it. As a result production was missing everything 0011
-- introduced — the `reviews` and `group_invitations` tables, the recipes rating
-- aggregates / soft-delete columns, the full-text `search_vector`, and several
-- indexes — which crashed the authenticated home page (column recipes.deleted_at
-- / recipes.rating_count does not exist).
--
-- This migration replays 0011 idempotently so it is a safe no-op on any database
-- that already ran 0011 (fresh installs) while healing production. It also
-- creates `reviews` with the columns 0018 later added via `ALTER TABLE IF EXISTS`
-- (photo_url / hidden_at / hidden_by), which no-oped on production because the
-- table did not yet exist.

-- Enum backing group_invitations.status.
DO $$ BEGIN
	CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "group_invitations" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"group_id" varchar(24) NOT NULL,
	"invited_by_id" varchar(24),
	"user_id" varchar(24),
	"email" varchar(320),
	"handle" varchar(60),
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"token" varchar(64) NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_invitations_token_unique" UNIQUE("token"),
	CONSTRAINT "group_invitations_contact_check" CHECK ("group_invitations"."email" is not null or "group_invitations"."handle" is not null)
);
--> statement-breakpoint

-- reviews includes the columns migration 0018 adds (photo_url / hidden_at /
-- hidden_by) so the canonical shape is created in one shot on production.
CREATE TABLE IF NOT EXISTS "reviews" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"recipe_id" varchar(24) NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"rating" integer NOT NULL,
	"title" varchar(200),
	"body" text,
	"photo_url" varchar(2048),
	"edited_at" timestamp with time zone,
	"hidden_at" timestamp with time zone,
	"hidden_by" varchar(24),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_recipe_user_uq" UNIQUE("recipe_id","user_id"),
	CONSTRAINT "reviews_rating_range_check" CHECK ("reviews"."rating" between 1 and 5)
);
--> statement-breakpoint

-- Drop the pre-0011 non-partial indexes so they can be recreated as
-- deleted_at-partial below (and recipe_versions_recipe_idx, which 0011 removes).
DROP INDEX IF EXISTS "recipe_versions_recipe_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "recipes_author_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "recipes_group_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "recipes_visibility_idx";--> statement-breakpoint

-- issue #170: convert recipe_versions.snapshot text -> jsonb, but only if it is
-- still text (idempotent: a no-op once already jsonb).
DO $$ BEGIN
	IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'recipe_versions' AND column_name = 'snapshot') = 'text' THEN
		UPDATE "recipe_versions" SET "snapshot" = '{}' WHERE btrim("snapshot") = '';
		ALTER TABLE "recipe_versions" ALTER COLUMN "snapshot" SET DATA TYPE jsonb USING "snapshot"::jsonb;
	END IF;
END $$;--> statement-breakpoint

ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "rating_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "rating_sum" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- issue #154: backfill the denormalized, owner-excluded rating aggregates from
-- existing ratings (a self-rating by the recipe's author is never counted).
UPDATE "recipes" r SET "rating_count" = agg.cnt, "rating_sum" = agg.total
FROM (
	SELECT rt."recipe_id" AS recipe_id,
		COUNT(*)::integer AS cnt,
		SUM(rt."value")::integer AS total
	FROM "ratings" rt
	JOIN "recipes" rc ON rc."id" = rt."recipe_id"
	WHERE rt."user_id" <> rc."author_id"
	GROUP BY rt."recipe_id"
) agg
WHERE r."id" = agg.recipe_id;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "deleted_by" varchar(24);--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "reviews" ADD CONSTRAINT "reviews_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
-- FK for the hidden_by column migration 0018 adds to reviews.
DO $$ BEGIN
	ALTER TABLE "reviews" ADD CONSTRAINT "reviews_hidden_by_users_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "recipes" ADD CONSTRAINT "recipes_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "group_invitations_pending_email_uq" ON "group_invitations" USING btree ("group_id","email") WHERE "group_invitations"."status" = 'pending' and "group_invitations"."email" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_invitations_group_idx" ON "group_invitations" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_recipe_idx" ON "reviews" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_user_idx" ON "reviews" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipe_events_actor_idx" ON "recipe_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipe_events_related_idx" ON "recipe_events" USING btree ("related_recipe_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipe_versions_author_idx" ON "recipe_versions" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comments_user_idx" ON "comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ratings_user_idx" ON "ratings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shopping_list_items_recipe_idx" ON "shopping_list_items" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_author_idx" ON "recipes" USING btree ("author_id") WHERE "recipes"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_group_idx" ON "recipes" USING btree ("group_id") WHERE "recipes"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_visibility_idx" ON "recipes" USING btree ("visibility") WHERE "recipes"."deleted_at" is null;--> statement-breakpoint

-- issue #151: de-duplicate any (recipe_id, version_number) collisions before the
-- UNIQUE constraint is added (a no-op when there are none).
WITH ranked AS (
	SELECT "id", "recipe_id", "version_number",
		ROW_NUMBER() OVER (
			PARTITION BY "recipe_id", "version_number" ORDER BY "created_at", "id"
		) AS rn
	FROM "recipe_versions"
),
maxes AS (
	SELECT "recipe_id", MAX("version_number") AS max_vn
	FROM "recipe_versions"
	GROUP BY "recipe_id"
),
renumbered AS (
	SELECT ranked."id",
		maxes.max_vn + ROW_NUMBER() OVER (
			PARTITION BY ranked."recipe_id" ORDER BY ranked."version_number", ranked."id"
		) AS new_vn
	FROM ranked
	JOIN maxes ON maxes."recipe_id" = ranked."recipe_id"
	WHERE ranked.rn > 1
)
UPDATE "recipe_versions" v SET "version_number" = renumbered.new_vn
FROM renumbered WHERE v."id" = renumbered."id";--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_recipe_version_uq" UNIQUE("recipe_id","version_number");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "recipes" ADD CONSTRAINT "recipes_rating_count_check" CHECK ("recipes"."rating_count" >= 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "recipes" ADD CONSTRAINT "recipes_rating_sum_check" CHECK ("recipes"."rating_sum" >= 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint

-- issue #158: full-text + trigram recipe search. search_vector is GENERATED ...
-- STORED so Postgres maintains it automatically.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "search_vector" tsvector GENERATED ALWAYS AS (
	setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
	setweight(to_tsvector('english', coalesce("description", '')), 'B') ||
	setweight(to_tsvector('english', coalesce("cuisine", '')), 'C')
) STORED;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_search_vector_idx" ON "recipes" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipe_ingredients_item_trgm_idx" ON "recipe_ingredients" USING gin ("item" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tags_name_trgm_idx" ON "tags" USING gin ("name" gin_trgm_ops);
