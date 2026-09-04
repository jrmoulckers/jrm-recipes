-- Contract phase for #1028. The values remain recoverable from food_nutrients;
-- food_nutrition remains the per-food provenance row.
ALTER TABLE "food_nutrition" DROP CONSTRAINT IF EXISTS "food_nutrition_kcal_check";--> statement-breakpoint
ALTER TABLE "food_nutrition" DROP CONSTRAINT IF EXISTS "food_nutrition_protein_check";--> statement-breakpoint
ALTER TABLE "food_nutrition" DROP CONSTRAINT IF EXISTS "food_nutrition_carbs_check";--> statement-breakpoint
ALTER TABLE "food_nutrition" DROP CONSTRAINT IF EXISTS "food_nutrition_fat_check";--> statement-breakpoint
ALTER TABLE "food_nutrition" DROP COLUMN IF EXISTS "kcal";--> statement-breakpoint
ALTER TABLE "food_nutrition" DROP COLUMN IF EXISTS "protein_g";--> statement-breakpoint
ALTER TABLE "food_nutrition" DROP COLUMN IF EXISTS "carbs_g";--> statement-breakpoint
ALTER TABLE "food_nutrition" DROP COLUMN IF EXISTS "fat_g";--> statement-breakpoint
ALTER TABLE "food_nutrition" DROP COLUMN IF EXISTS "fiber_g";--> statement-breakpoint
ALTER TABLE "food_nutrition" DROP COLUMN IF EXISTS "sugar_g";--> statement-breakpoint
ALTER TABLE "food_nutrition" DROP COLUMN IF EXISTS "sodium_mg";