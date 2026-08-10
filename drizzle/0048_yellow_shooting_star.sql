-- Issue #658 (epic #655). Additive, index-only, and idempotent so a re-run
-- during a rolling deploy is a no-op rather than a failure.
--
-- The media library links a photo to the content that uses it by URL rather
-- than by foreign key, so `/settings/photos` answers "is this photo still in
-- use?" with one equality lookup per URL-bearing column. Without these the
-- confirm dialog would sequentially scan six tables.
--
-- Each is partial on `IS NOT NULL`: only a minority of rows carry an image, and
-- the lookup never searches for NULL, so the index stays a small fraction of
-- the table and costs correspondingly little on write.
CREATE INDEX IF NOT EXISTS "groups_avatar_url_idx" ON "groups" USING btree ("avatar_url") WHERE "groups"."avatar_url" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipe_steps_image_url_idx" ON "recipe_steps" USING btree ("image_url") WHERE "recipe_steps"."image_url" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_cover_image_url_idx" ON "recipes" USING btree ("cover_image_url") WHERE "recipes"."cover_image_url" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_photo_url_idx" ON "reviews" USING btree ("photo_url") WHERE "reviews"."photo_url" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cook_log_entries_photo_url_idx" ON "cook_log_entries" USING btree ("photo_url") WHERE "cook_log_entries"."photo_url" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "collections_cover_image_url_idx" ON "collections" USING btree ("cover_image_url") WHERE "collections"."cover_image_url" is not null;