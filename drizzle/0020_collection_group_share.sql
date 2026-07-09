-- 0020: share a collection with a family group (#365).
-- New lightweight join table linking a collection to a group it's shared with.
-- Idempotent by construction (scripts/migrate.mjs / the deploy runner may re-run
-- against a SHARED database): CREATE TABLE IF NOT EXISTS + DO $$ guards that
-- swallow duplicate_object/duplicate_table/undefined_table + CREATE INDEX IF NOT
-- EXISTS, so re-running 0000->0020 and then re-running 0020 is a no-op.
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
