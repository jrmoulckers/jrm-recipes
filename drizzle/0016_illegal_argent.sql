-- Consolidated home-chef precision migration (issues #401/#409/#410/#417/#425).
-- Idempotent by construction: scripts/migrate.mjs runs on EVERY Vercel deploy
-- against a SHARED database, so re-running against pre-existing objects must
-- never error. Columns use ADD COLUMN IF NOT EXISTS; CHECK constraints are
-- wrapped in DO $$ ... EXCEPTION WHEN duplicate_object guards. All additive.
--
-- Columns added:
--   recipe_ingredients.prep           varchar(200)  (#401 structured prep state)
--   recipe_ingredients.step_position  integer       (#425 ingredient->step link)
--   recipe_steps.target_temp_c        integer       (#417 target temp, Celsius)
--   recipe_steps.doneness             varchar(200)  (#417 doneness cue)
--   recipes.rest_minutes              integer       (#409 inactive/rest time)
--   recipes.make_ahead_note           varchar(500)  (#409 make-ahead callout)
--   recipes.equipment                 text[]        (#410 tools/equipment list)
ALTER TABLE "recipe_ingredients" ADD COLUMN IF NOT EXISTS "prep" varchar(200);--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD COLUMN IF NOT EXISTS "step_position" integer;--> statement-breakpoint
ALTER TABLE "recipe_steps" ADD COLUMN IF NOT EXISTS "target_temp_c" integer;--> statement-breakpoint
ALTER TABLE "recipe_steps" ADD COLUMN IF NOT EXISTS "doneness" varchar(200);--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "rest_minutes" integer;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "make_ahead_note" varchar(500);--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "equipment" text[];--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_step_position_check" CHECK ("recipe_ingredients"."step_position" is null or "recipe_ingredients"."step_position" >= 0);
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipes" ADD CONSTRAINT "recipes_rest_minutes_check" CHECK ("recipes"."rest_minutes" >= 0);
EXCEPTION WHEN duplicate_object THEN null; END $$;
