-- Issue #989. Additive, nullable caption metadata keeps old application instances
-- and existing uncaptioned videos valid during the rolling deployment.
ALTER TABLE IF EXISTS "recipe_steps" ADD COLUMN IF NOT EXISTS "caption_url" varchar(2048);--> statement-breakpoint
ALTER TABLE IF EXISTS "recipe_steps" ADD COLUMN IF NOT EXISTS "caption_language" varchar(35);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipe_steps" ADD CONSTRAINT "recipe_steps_caption_pair_check" CHECK (("recipe_steps"."caption_url" is null and "recipe_steps"."caption_language" is null) or ("recipe_steps"."caption_url" is not null and "recipe_steps"."caption_language" is not null and "recipe_steps"."video_url" is not null));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;