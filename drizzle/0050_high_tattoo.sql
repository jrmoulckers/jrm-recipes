CREATE TABLE "food_nutrients" (
	"food_id" varchar(24) NOT NULL,
	"nutrient_id" varchar(40) NOT NULL,
	"per100g" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_nutrients_food_id_nutrient_id_pk" PRIMARY KEY("food_id","nutrient_id"),
	CONSTRAINT "food_nutrients_value_check" CHECK ("food_nutrients"."per100g" >= 0)
);
--> statement-breakpoint
CREATE TABLE "nutrients" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"label" varchar(60) NOT NULL,
	"unit" varchar(12) NOT NULL,
	"daily_value" real,
	"display_precision" integer DEFAULT 0 NOT NULL,
	"display_order" integer NOT NULL,
	"is_macro" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nutrients_daily_value_check" CHECK ("nutrients"."daily_value" IS NULL OR "nutrients"."daily_value" > 0),
	CONSTRAINT "nutrients_precision_check" CHECK ("nutrients"."display_precision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "food_nutrients" ADD CONSTRAINT "food_nutrients_food_id_food_items_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_nutrients" ADD CONSTRAINT "food_nutrients_nutrient_id_nutrients_id_fk" FOREIGN KEY ("nutrient_id") REFERENCES "public"."nutrients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_nutrients_nutrient_idx" ON "food_nutrients" USING btree ("nutrient_id");--> statement-breakpoint
CREATE INDEX "nutrients_display_order_idx" ON "nutrients" USING btree ("display_order");
--> statement-breakpoint
-- Seed the nutrient registry (#1028). Mirrors `src/lib/nutrients.ts`, which stays
-- the source of truth; `pnpm db:seed` re-upserts these rows. Seeded here as well
-- so the backfill below has its foreign key targets in the same transaction.
INSERT INTO "nutrients" ("id", "label", "unit", "daily_value", "display_precision", "display_order", "is_macro") VALUES
	('kcal', 'Calories', 'kcal', NULL, 0, 10, true),
	('fatG', 'Total fat', 'g', NULL, 1, 20, true),
	('satFatG', 'Saturated fat', 'g', NULL, 1, 30, false),
	('sodiumMg', 'Sodium', 'mg', 2300, 0, 40, false),
	('carbsG', 'Total carbohydrate', 'g', NULL, 1, 50, true),
	('fiberG', 'Dietary fiber', 'g', NULL, 1, 60, false),
	('sugarG', 'Sugars', 'g', 50, 1, 70, false),
	('proteinG', 'Protein', 'g', NULL, 1, 80, true)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
-- Backfill the vector from every existing `food_nutrition` value. This copies
-- what is deployed rather than re-seeding from the static dataset, so a value a
-- future USDA sync refined in the table is preserved instead of being reverted.
-- `IS NOT NULL` keeps "unknown" as an absent row, never a confident zero.
-- `DO NOTHING` makes a re-run a no-op. Saturated fat has no legacy column to
-- copy: it arrives from the seed, which is the whole point of the change.
INSERT INTO "food_nutrients" ("food_id", "nutrient_id", "per100g")
SELECT "food_id", 'kcal', "kcal" FROM "food_nutrition" WHERE "kcal" IS NOT NULL
ON CONFLICT ("food_id", "nutrient_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "food_nutrients" ("food_id", "nutrient_id", "per100g")
SELECT "food_id", 'proteinG', "protein_g" FROM "food_nutrition" WHERE "protein_g" IS NOT NULL
ON CONFLICT ("food_id", "nutrient_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "food_nutrients" ("food_id", "nutrient_id", "per100g")
SELECT "food_id", 'carbsG', "carbs_g" FROM "food_nutrition" WHERE "carbs_g" IS NOT NULL
ON CONFLICT ("food_id", "nutrient_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "food_nutrients" ("food_id", "nutrient_id", "per100g")
SELECT "food_id", 'fatG', "fat_g" FROM "food_nutrition" WHERE "fat_g" IS NOT NULL
ON CONFLICT ("food_id", "nutrient_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "food_nutrients" ("food_id", "nutrient_id", "per100g")
SELECT "food_id", 'fiberG', "fiber_g" FROM "food_nutrition" WHERE "fiber_g" IS NOT NULL
ON CONFLICT ("food_id", "nutrient_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "food_nutrients" ("food_id", "nutrient_id", "per100g")
SELECT "food_id", 'sugarG', "sugar_g" FROM "food_nutrition" WHERE "sugar_g" IS NOT NULL
ON CONFLICT ("food_id", "nutrient_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "food_nutrients" ("food_id", "nutrient_id", "per100g")
SELECT "food_id", 'sodiumMg', "sodium_mg" FROM "food_nutrition" WHERE "sodium_mg" IS NOT NULL
ON CONFLICT ("food_id", "nutrient_id") DO NOTHING;