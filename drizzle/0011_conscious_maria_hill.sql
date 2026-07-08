ALTER TABLE "recipes" ADD COLUMN "calories" integer;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "protein_grams" real;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "carbs_grams" real;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "fat_grams" real;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "saturated_fat_grams" real;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "sodium_mg" integer;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "sugar_grams" real;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "fiber_grams" real;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_calories_check" CHECK ("recipes"."calories" >= 0);--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_protein_grams_check" CHECK ("recipes"."protein_grams" >= 0);--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_carbs_grams_check" CHECK ("recipes"."carbs_grams" >= 0);--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_fat_grams_check" CHECK ("recipes"."fat_grams" >= 0);--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_saturated_fat_grams_check" CHECK ("recipes"."saturated_fat_grams" >= 0);--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_sodium_mg_check" CHECK ("recipes"."sodium_mg" >= 0);--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_sugar_grams_check" CHECK ("recipes"."sugar_grams" >= 0);--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_fiber_grams_check" CHECK ("recipes"."fiber_grams" >= 0);