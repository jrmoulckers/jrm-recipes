CREATE TYPE "public"."deletion_trigger" AS ENUM('clerk_webhook', 'in_app', 'admin', 'dsr_request');--> statement-breakpoint
CREATE TABLE "deletion_records" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"subject_hash" varchar(64) NOT NULL,
	"clerk_id_hash" varchar(64),
	"trigger" "deletion_trigger" NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"deleted_counts" jsonb,
	"retained_recipe_count" integer DEFAULT 0 NOT NULL,
	"purged_asset_count" integer DEFAULT 0 NOT NULL,
	"processor_status" jsonb,
	"backup_horizon_at" timestamp with time zone,
	"notice_version" varchar(40),
	CONSTRAINT "deletion_records_subjectHash_unique" UNIQUE("subject_hash")
);
--> statement-breakpoint
ALTER TABLE "recipes" DROP CONSTRAINT "recipes_author_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "media_assets" DROP CONSTRAINT "media_assets_user_id_users_id_fk";
--> statement-breakpoint
CREATE INDEX "deletion_records_clerk_id_hash_idx" ON "deletion_records" USING btree ("clerk_id_hash");--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;