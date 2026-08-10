-- Multi-store shopping lists (#664).
--
-- Expand phase only: `shopping_lists.store_name` is kept and dual-written by
-- the application for the deploy window (see docs/migrations.md). A later
-- contract migration drops it. Every statement is idempotent so re-applying
-- this migration is a no-op.
CREATE TABLE IF NOT EXISTS "shopping_stores" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"name" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shopping_list_stores" (
	"list_id" varchar(24) NOT NULL,
	"store_id" varchar(24) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "shopping_list_stores_list_id_store_id_pk" PRIMARY KEY("list_id","store_id"),
	CONSTRAINT "shopping_list_stores_position_check" CHECK ("shopping_list_stores"."position" >= 0)
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "shopping_stores" ADD CONSTRAINT "shopping_stores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "shopping_list_stores" ADD CONSTRAINT "shopping_list_stores_list_id_shopping_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."shopping_lists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "shopping_list_stores" ADD CONSTRAINT "shopping_list_stores_store_id_shopping_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."shopping_stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shopping_list_stores_list_position_idx" ON "shopping_list_stores" USING btree ("list_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shopping_list_stores_store_idx" ON "shopping_list_stores" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shopping_stores_user_idx" ON "shopping_stores" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shopping_stores_user_name_uq" ON "shopping_stores" USING btree ("user_id","name");--> statement-breakpoint
INSERT INTO "shopping_stores" ("id", "user_id", "name")
SELECT DISTINCT
	'a' || substr(md5("user_id" || ':' || btrim("store_name")), 1, 23),
	"user_id",
	btrim("store_name")
FROM "shopping_lists"
WHERE "store_name" IS NOT NULL AND btrim("store_name") <> ''
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shopping_list_stores" ("list_id", "store_id", "position")
SELECT
	"id",
	'a' || substr(md5("user_id" || ':' || btrim("store_name")), 1, 23),
	0
FROM "shopping_lists"
WHERE "store_name" IS NOT NULL AND btrim("store_name") <> ''
ON CONFLICT DO NOTHING;
