CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TABLE "group_invitations" (
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
CREATE TABLE "reviews" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"recipe_id" varchar(24) NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"rating" integer NOT NULL,
	"title" varchar(200),
	"body" text,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_recipe_user_uq" UNIQUE("recipe_id","user_id"),
	CONSTRAINT "reviews_rating_range_check" CHECK ("reviews"."rating" between 1 and 5)
);
--> statement-breakpoint
DROP INDEX "recipe_versions_recipe_idx";--> statement-breakpoint
DROP INDEX "recipes_author_idx";--> statement-breakpoint
DROP INDEX "recipes_group_idx";--> statement-breakpoint
DROP INDEX "recipes_visibility_idx";--> statement-breakpoint
-- issue #170: repair any empty/whitespace snapshot text to a valid JSON object
-- so the text -> jsonb conversion below cannot fail on a legacy row, then convert
-- with an explicit USING cast (Postgres will not implicitly cast text to jsonb).
UPDATE "recipe_versions" SET "snapshot" = '{}' WHERE btrim("snapshot") = '';--> statement-breakpoint
ALTER TABLE "recipe_versions" ALTER COLUMN "snapshot" SET DATA TYPE jsonb USING "snapshot"::jsonb;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "rating_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "rating_sum" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- issue #154: backfill the denormalized, owner-excluded rating aggregates from
-- existing ratings (a self-rating by the recipe's author is never counted) so the
-- columns are correct before the non-negative CHECKs are added at the end.
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
ALTER TABLE "recipes" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "deleted_by" varchar(24);--> statement-breakpoint
ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "group_invitations_pending_email_uq" ON "group_invitations" USING btree ("group_id","email") WHERE "group_invitations"."status" = 'pending' and "group_invitations"."email" is not null;--> statement-breakpoint
CREATE INDEX "group_invitations_group_idx" ON "group_invitations" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "reviews_recipe_idx" ON "reviews" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "reviews_user_idx" ON "reviews" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_events_actor_idx" ON "recipe_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "recipe_events_related_idx" ON "recipe_events" USING btree ("related_recipe_id");--> statement-breakpoint
CREATE INDEX "recipe_versions_author_idx" ON "recipe_versions" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "comments_user_idx" ON "comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ratings_user_idx" ON "ratings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shopping_list_items_recipe_idx" ON "shopping_list_items" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "recipes_author_idx" ON "recipes" USING btree ("author_id") WHERE "recipes"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "recipes_group_idx" ON "recipes" USING btree ("group_id") WHERE "recipes"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "recipes_visibility_idx" ON "recipes" USING btree ("visibility") WHERE "recipes"."deleted_at" is null;--> statement-breakpoint
-- issue #151: de-duplicate any (recipe_id, version_number) collisions the old
-- max+1 allocation could produce under concurrent edits, renumbering the extra
-- rows to fresh numbers above each recipe's current max, so the UNIQUE constraint
-- below cannot fail on legacy data.
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
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_recipe_version_uq" UNIQUE("recipe_id","version_number");--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_rating_count_check" CHECK ("recipes"."rating_count" >= 0);--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_rating_sum_check" CHECK ("recipes"."rating_sum" >= 0);--> statement-breakpoint
-- issue #158: full-text + trigram recipe search, provisioned by hand rather than
-- through the Drizzle schema so drizzle-kit never diffs a generated column or a
-- GIN opclass (either would surface as phantom drift). search_vector is
-- GENERATED ... STORED, so Postgres maintains it automatically on every write;
-- the weights (A/B/C) rank title above description above cuisine.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
	setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
	setweight(to_tsvector('english', coalesce("description", '')), 'B') ||
	setweight(to_tsvector('english', coalesce("cuisine", '')), 'C')
) STORED;--> statement-breakpoint
CREATE INDEX "recipes_search_vector_idx" ON "recipes" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "recipe_ingredients_item_trgm_idx" ON "recipe_ingredients" USING gin ("item" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "tags_name_trgm_idx" ON "tags" USING gin ("name" gin_trgm_ops);