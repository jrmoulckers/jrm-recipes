-- Issue #659 (epic #655). Additive only, and idempotent so a re-run during a
-- rolling deploy is a no-op rather than a failure.
--
-- `users.avatar_user_managed` records that the account's avatar was chosen in
-- Heirloom rather than mirrored from Clerk, so the `user.updated` webhook stops
-- overwriting it. Defaulting to false keeps every existing row on the current
-- Clerk-synced behavior.
--
-- `recipes.cover_image_alt` / `recipe_steps.image_alt` hold author-written alt
-- text (#125). Nullable, because a null means "keep generating the alt the way
-- we always have", so no backfill is needed and nothing regresses.
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "avatar_user_managed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE IF EXISTS "recipe_steps" ADD COLUMN IF NOT EXISTS "image_alt" varchar(300);--> statement-breakpoint
ALTER TABLE IF EXISTS "recipes" ADD COLUMN IF NOT EXISTS "cover_image_alt" varchar(300);