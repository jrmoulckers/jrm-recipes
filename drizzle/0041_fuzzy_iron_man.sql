-- Issue #666: app-owned user namespace (`users.slug`) + its permanent alias history.
--
-- Hand-adjusted from the generated migration. `drizzle-kit` emits a bare
-- `ADD COLUMN "slug" varchar(60) NOT NULL`, which cannot run against a table
-- that already has rows. This follows the expand/contract convention in
-- docs/migrations.md instead: add the column nullable, backfill every existing
-- user, then tighten to NOT NULL + UNIQUE. The end state is identical to the
-- generated snapshot, so `pnpm db:generate` stays clean.
--
-- Every statement is idempotent so a partially-applied migration can be re-run.

CREATE TABLE IF NOT EXISTS "user_slug_aliases" (
	"slug" varchar(60) PRIMARY KEY NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "user_slug_aliases" ADD CONSTRAINT "user_slug_aliases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_slug_aliases_user_idx" ON "user_slug_aliases" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "slug" varchar(60);
--> statement-breakpoint
-- Backfill: prefer the Clerk handle, else the display name, else an opaque
-- `cook-<id>`. Mirrors `userSlugBase` in src/lib/user-slug.ts (lowercase, drop
-- quotes, collapse every other run to a single hyphen, trim hyphens, cap at 60)
-- and the reserved set in the same module, which must never be assigned because
-- those segments collide with static routes under `/recipes/*`.
-- Duplicates are disambiguated with the user's own id, which is unique, so the
-- UNIQUE constraint added below cannot fail.
WITH candidate AS (
	SELECT
		"id",
		regexp_replace(lower("id"), '[^a-z0-9]', '', 'g') AS "safe_id",
		NULLIF(
			trim(BOTH '-' FROM left(
				regexp_replace(
					regexp_replace(
						lower(COALESCE(NULLIF(trim("handle"), ''), NULLIF(trim("name"), ''), '')),
						'[''"]', '', 'g'
					),
					'[^a-z0-9]+', '-', 'g'
				),
				60
			)),
			''
		) AS "base"
	FROM "users"
	WHERE "slug" IS NULL
), resolved AS (
	SELECT
		"id",
		"safe_id",
		CASE
			WHEN "base" IS NULL OR "base" IN ('new', 'tags', 'cook-with', 'r', 'api', 'admin', 'www')
				THEN 'cook-' || left("safe_id", 8)
			ELSE "base"
		END AS "slug"
	FROM candidate
), ranked AS (
	SELECT
		"id",
		"safe_id",
		"slug",
		row_number() OVER (PARTITION BY "slug" ORDER BY "id") AS "rn"
	FROM resolved
)
UPDATE "users" u
SET "slug" = CASE
	WHEN r."rn" = 1 THEN r."slug"
	ELSE trim(BOTH '-' FROM left(r."slug", 35)) || '-' || r."safe_id"
END
FROM ranked r
WHERE u."id" = r."id" AND u."slug" IS NULL;
--> statement-breakpoint
-- Any row a concurrent writer inserted mid-backfill still needs a value before
-- the column can be tightened.
UPDATE "users"
SET "slug" = 'cook-' || regexp_replace(lower("id"), '[^a-z0-9]', '', 'g')
WHERE "slug" IS NULL;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "slug" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "users" ADD CONSTRAINT "users_slug_unique" UNIQUE("slug");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
