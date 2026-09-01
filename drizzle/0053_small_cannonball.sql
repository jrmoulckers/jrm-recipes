ALTER TYPE "public"."recipe_event_type" ADD VALUE 'claimed';--> statement-breakpoint
UPDATE "users"
SET "slug" = 'unclaimed-' || left("id", 8), "updated_at" = now()
WHERE "slug" = 'unclaimed';--> statement-breakpoint
UPDATE "user_slug_aliases"
SET "slug" = 'unclaimed-' || left("user_id", 8) || '-alias'
WHERE "slug" = 'unclaimed';--> statement-breakpoint
DROP INDEX "media_assets_user_public_id_uq";--> statement-breakpoint
ALTER TABLE "recipes" ALTER COLUMN "author_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "custodian_recipe_id" varchar(24);--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "resource_type" varchar(5) DEFAULT 'image' NOT NULL;--> statement-breakpoint
UPDATE "media_assets"
SET "resource_type" = 'video'
WHERE "url" LIKE '%/video/upload/%';--> statement-breakpoint
UPDATE "media_assets"
SET "resource_type" = 'raw'
WHERE "url" LIKE '%/raw/upload/%';--> statement-breakpoint
ALTER TABLE "deletion_records" ADD COLUMN "request_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "deletion_records" ADD COLUMN "unclaimed_recipe_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "deletion_records" ADD COLUMN "retained_version_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "deletion_records" ADD COLUMN "transferred_asset_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_custodian_recipe_id_recipes_id_fk" FOREIGN KEY ("custodian_recipe_id") REFERENCES "public"."recipes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_assets_custodian_recipe_idx" ON "media_assets" USING btree ("custodian_recipe_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_recipe_public_id_uq" ON "media_assets" USING btree ("custodian_recipe_id","resource_type","public_id") WHERE "media_assets"."custodian_recipe_id" is not null and "media_assets"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_user_public_id_uq" ON "media_assets" USING btree ("user_id","resource_type","public_id") WHERE "media_assets"."user_id" is not null and "media_assets"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "user_slug_aliases" ADD CONSTRAINT "user_slug_aliases_reserved_check" CHECK ("user_slug_aliases"."slug" <> 'unclaimed');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_slug_reserved_check" CHECK ("users"."slug" <> 'unclaimed');--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_custodian_check" CHECK (("media_assets"."user_id" is not null) <> ("media_assets"."custodian_recipe_id" is not null));