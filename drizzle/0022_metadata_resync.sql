-- 0022: drizzle metadata catch-up for the hand-written migrations 0019-0021.
--
-- Migrations 0019 (heirloom recipe metadata), 0020 (collection<->group share),
-- and 0021 (shopping-list "optional" flag) were authored by hand and never had
-- their drizzle snapshots regenerated, so drizzle/meta/ jumped 0018 -> 0022 and
-- `pnpm db:generate` kept re-emitting those objects (the "Migration drift" CI
-- gate). This migration ships the snapshot that closes that gap; its SQL is a
-- deliberate idempotent no-op against any database that already applied
-- 0019-0021 (production + fresh CI databases alike).
--
-- Idempotent by construction (scripts/migrate.mjs runs on EVERY Vercel deploy
-- against a SHARED database, and the CI "Migrations" job runs the chain twice):
-- IF NOT EXISTS + DO $$ guards, so re-running 0000->0022 and then re-running
-- 0022 is a clean no-op.

-- 0019: additive heirloom provenance columns on "recipes".
ALTER TABLE IF EXISTS "recipes" ADD COLUMN IF NOT EXISTS "story" text;--> statement-breakpoint
ALTER TABLE IF EXISTS "recipes" ADD COLUMN IF NOT EXISTS "handed_down_from" varchar(200);--> statement-breakpoint
ALTER TABLE IF EXISTS "recipes" ADD COLUMN IF NOT EXISTS "origin_year" varchar(40);--> statement-breakpoint
ALTER TABLE IF EXISTS "recipes" ADD COLUMN IF NOT EXISTS "origin_place" varchar(200);--> statement-breakpoint

-- 0021: additive "optional" flag on shopping-list lines.
ALTER TABLE IF EXISTS "shopping_list_items" ADD COLUMN IF NOT EXISTS "optional" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- 0020: collection<->group share join table.
CREATE TABLE IF NOT EXISTS "collection_groups" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"collection_id" varchar(24) NOT NULL,
	"group_id" varchar(24) NOT NULL,
	"shared_by_id" varchar(24),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_groups_collection_group_uq" UNIQUE("collection_id","group_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collection_groups" ADD CONSTRAINT "collection_groups_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table OR undefined_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collection_groups" ADD CONSTRAINT "collection_groups_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table OR undefined_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collection_groups" ADD CONSTRAINT "collection_groups_shared_by_id_users_id_fk" FOREIGN KEY ("shared_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table OR undefined_table THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "collection_groups_collection_idx" ON "collection_groups" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "collection_groups_group_idx" ON "collection_groups" USING btree ("group_id");
