-- Issue #150: CHECK constraints for the rating range and non-negative numeric
-- fields. Repair any pre-existing out-of-range rows FIRST (clamp to the nearest
-- valid value) so ADD CONSTRAINT can't fail on legacy/imported data. These
-- repairs are no-ops on clean data such as the seed set.
UPDATE "recipe_ingredients" SET "quantity" = 0 WHERE "quantity" < 0;--> statement-breakpoint
UPDATE "recipe_ingredients" SET "quantity_max" = 0 WHERE "quantity_max" < 0;--> statement-breakpoint
UPDATE "recipe_ingredients" SET "quantity_max" = "quantity" WHERE "quantity_max" IS NOT NULL AND "quantity" IS NOT NULL AND "quantity_max" < "quantity";--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_quantity_check" CHECK ("recipe_ingredients"."quantity" >= 0);--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_quantity_max_check" CHECK ("recipe_ingredients"."quantity_max" >= 0);--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_quantity_range_check" CHECK ("recipe_ingredients"."quantity_max" is null or "recipe_ingredients"."quantity" is null or "recipe_ingredients"."quantity_max" >= "recipe_ingredients"."quantity");--> statement-breakpoint
UPDATE "recipe_steps" SET "timer_seconds" = 0 WHERE "timer_seconds" < 0;--> statement-breakpoint
ALTER TABLE "recipe_steps" ADD CONSTRAINT "recipe_steps_timer_seconds_check" CHECK ("recipe_steps"."timer_seconds" >= 0);--> statement-breakpoint
UPDATE "recipes" SET "servings" = 1 WHERE "servings" < 1;--> statement-breakpoint
UPDATE "recipes" SET "prep_minutes" = 0 WHERE "prep_minutes" < 0;--> statement-breakpoint
UPDATE "recipes" SET "cook_minutes" = 0 WHERE "cook_minutes" < 0;--> statement-breakpoint
UPDATE "recipes" SET "total_minutes" = 0 WHERE "total_minutes" < 0;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_servings_check" CHECK ("recipes"."servings" >= 1);--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_prep_minutes_check" CHECK ("recipes"."prep_minutes" >= 0);--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_cook_minutes_check" CHECK ("recipes"."cook_minutes" >= 0);--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_total_minutes_check" CHECK ("recipes"."total_minutes" >= 0);--> statement-breakpoint
UPDATE "ratings" SET "value" = LEAST(GREATEST("value", 1), 5) WHERE "value" < 1 OR "value" > 5;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_value_range_check" CHECK ("ratings"."value" between 1 and 5);--> statement-breakpoint
UPDATE "shopping_list_items" SET "quantity" = 0 WHERE "quantity" < 0;--> statement-breakpoint
UPDATE "shopping_list_items" SET "quantity_max" = 0 WHERE "quantity_max" < 0;--> statement-breakpoint
UPDATE "shopping_list_items" SET "quantity_max" = "quantity" WHERE "quantity_max" IS NOT NULL AND "quantity" IS NOT NULL AND "quantity_max" < "quantity";--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_quantity_check" CHECK ("shopping_list_items"."quantity" >= 0);--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_quantity_max_check" CHECK ("shopping_list_items"."quantity_max" >= 0);--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_quantity_range_check" CHECK ("shopping_list_items"."quantity_max" is null or "shopping_list_items"."quantity" is null or "shopping_list_items"."quantity_max" >= "shopping_list_items"."quantity");