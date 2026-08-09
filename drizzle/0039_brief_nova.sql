-- Media library foundation for issue #657 (epic #655).
-- Gives an uploaded photo an owner and a lifecycle so it can be reused across
-- surfaces, described for screen readers, and genuinely deleted (reclaiming the
-- owner's storage allowance) instead of orphaned behind a cleared URL column.
--
-- Purely additive: no existing image column is touched, and assets link to the
-- surfaces that use them by URL rather than by foreign key, so nothing breaks
-- when an asset row is absent (pre-existing photos) or tombstoned.
DO $$ BEGIN
	CREATE TYPE "public"."media_provider" AS ENUM('cloudinary', 'external');
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "media_assets" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"provider" "media_provider" DEFAULT 'cloudinary' NOT NULL,
	"public_id" varchar(255),
	"url" varchar(2048) NOT NULL,
	"alt_text" varchar(300),
	"width" integer,
	"height" integer,
	"bytes" integer,
	"format" varchar(16),
	"folder" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" varchar(24)
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_assets_user_idx" ON "media_assets" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_assets_url_idx" ON "media_assets" USING btree ("url");--> statement-breakpoint
-- Partial unique index: the upload widget's success callback can fire more than
-- once, so recording an upload upserts on (user_id, public_id) rather than
-- creating a duplicate row (and double-billing the same bytes). Scoped to live
-- rows so a tombstoned asset never blocks a later re-upload of the same id.
CREATE UNIQUE INDEX IF NOT EXISTS "media_assets_user_public_id_uq" ON "media_assets" USING btree ("user_id","public_id") WHERE "media_assets"."deleted_at" is null;
