-- Versioned macro targets (#1046, refs #1024). Expand phase per
-- `docs/migrations.md`: a new table plus a backfill, and **no change** to
-- `member_dietary_profiles.calorie_goal`, which the currently deployed build
-- still reads. The contract migration drops that column once nothing does.
--
-- The backfill is what keeps the fold honest: every profile that already has a
-- calorie goal gets a target row carrying it, effective from the day the profile
-- was created, so no member silently loses a goal they set.
--
-- Guarded so a re-apply against a shared preview/branch database is a no-op. The
-- backfilled id is derived from the profile id rather than random, so a second
-- pass produces the same row and conflicts with itself instead of duplicating.
CREATE TABLE IF NOT EXISTS "nutrition_targets" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"profile_id" varchar(24) NOT NULL,
	"effective_from" date NOT NULL,
	"targets" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "nutrition_targets" ADD CONSTRAINT "nutrition_targets_profile_id_member_dietary_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."member_dietary_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
	WHEN duplicate_table THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "nutrition_targets_profile_effective_uq" ON "nutrition_targets" USING btree ("profile_id","effective_from");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nutrition_targets_profile_idx" ON "nutrition_targets" USING btree ("profile_id");--> statement-breakpoint
INSERT INTO "nutrition_targets" ("id", "profile_id", "effective_from", "targets")
SELECT substr(md5('nutrition_target:' || "id"), 1, 24), "id", "created_at"::date, jsonb_build_object('calories', "calorie_goal")
FROM "member_dietary_profiles"
WHERE "calorie_goal" IS NOT NULL AND "calorie_goal" > 0
ON CONFLICT DO NOTHING;
